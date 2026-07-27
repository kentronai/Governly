#!/bin/bash
# Provisions a fresh EC2 instance for Kentron on AWS
# Run from the project root: bash infra/aws/provision.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
die()     { echo -e "${RED}[ERR]${NC}   $1"; exit 1; }

REGION="us-east-1"
INSTANCE_TYPE="t3.2xlarge"
AMI_ID_FALLBACK="ami-0c7217cdde317cfec"   # Ubuntu 22.04 LTS, us-east-1 (static fallback)
KEY_NAME="kentron-deployer"
KEY_FILE="$(dirname "$0")/${KEY_NAME}.pem"
SG_NAME="kentron-sg"
ROLE_NAME="kentron-ec2-role"
PROFILE_NAME="kentron-ec2-profile"
INSTANCE_TAG="kentron-production"
EBS_SIZE=60

echo "╔══════════════════════════════════════════════╗"
echo "║   Kentron — AWS EC2 Provision Script         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Verify credentials
info "Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || die "AWS credentials not configured. Run: aws configure"
success "Authenticated as account ${ACCOUNT_ID}"

CALLER=$(aws sts get-caller-identity --query 'Arn' --output text)
info "Caller: ${CALLER}"

# Resolve the current Ubuntu 22.04 AMI from Canonical's public SSM parameter;
# fall back to the pinned ID if SSM is unreachable.
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id \
  --region "${REGION}" --query 'Parameter.Value' --output text 2>/dev/null) || AMI_ID=""
if [ -z "${AMI_ID}" ] || [ "${AMI_ID}" = "None" ]; then
  warn "SSM AMI lookup failed — using pinned fallback ${AMI_ID_FALLBACK}"
  AMI_ID="${AMI_ID_FALLBACK}"
fi
info "Using AMI: ${AMI_ID}"

# ── Key Pair ────────────────────────────────────────────────────────────────
info "Creating key pair '${KEY_NAME}'..."
if aws ec2 describe-key-pairs --key-names "${KEY_NAME}" --region "${REGION}" &>/dev/null; then
  warn "Key pair '${KEY_NAME}' already exists — skipping creation."
  if [ ! -f "${KEY_FILE}" ]; then
    warn "WARNING: ${KEY_FILE} not found locally. You may need to recreate the key pair."
  fi
else
  aws ec2 create-key-pair \
    --key-name "${KEY_NAME}" \
    --region "${REGION}" \
    --query 'KeyMaterial' \
    --output text > "${KEY_FILE}"
  chmod 400 "${KEY_FILE}"
  success "Key pair created → ${KEY_FILE}"
fi

# ── Security Group ──────────────────────────────────────────────────────────
info "Creating security group '${SG_NAME}'..."
MY_IP=$(curl -s https://checkip.amazonaws.com)/32
existing_sg=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${SG_NAME}" \
  --region "${REGION}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null)

if [ "${existing_sg}" != "None" ] && [ -n "${existing_sg}" ]; then
  warn "Security group '${SG_NAME}' already exists (${existing_sg})"
  SG_ID="${existing_sg}"
else
  SG_ID=$(aws ec2 create-security-group \
    --group-name "${SG_NAME}" \
    --description "Kentron production security group" \
    --region "${REGION}" \
    --query 'GroupId' \
    --output text)
  success "Security group created: ${SG_ID}"

  # SSH from deployer IP only
  aws ec2 authorize-security-group-ingress \
    --group-id "${SG_ID}" --region "${REGION}" \
    --protocol tcp --port 22 --cidr "${MY_IP}" \
    --no-cli-pager
  # HTTP
  aws ec2 authorize-security-group-ingress \
    --group-id "${SG_ID}" --region "${REGION}" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 \
    --no-cli-pager
  # HTTPS
  aws ec2 authorize-security-group-ingress \
    --group-id "${SG_ID}" --region "${REGION}" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 \
    --no-cli-pager
  success "Security group rules added (SSH from ${MY_IP}, HTTP, HTTPS)"
fi

# ── IAM Role for EC2 (S3 access) ────────────────────────────────────────────
info "Creating IAM role '${ROLE_NAME}'..."
if aws iam get-role --role-name "${ROLE_NAME}" &>/dev/null; then
  warn "IAM role '${ROLE_NAME}' already exists — skipping."
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{
        "Effect":"Allow",
        "Principal":{"Service":"ec2.amazonaws.com"},
        "Action":"sts:AssumeRole"
      }]
    }' \
    --no-cli-pager > /dev/null
  aws iam attach-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-arn "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
  success "IAM role created with S3ReadOnly policy"
fi

if aws iam get-instance-profile --instance-profile-name "${PROFILE_NAME}" &>/dev/null; then
  warn "Instance profile '${PROFILE_NAME}' already exists — skipping."
else
  aws iam create-instance-profile --instance-profile-name "${PROFILE_NAME}" --no-cli-pager > /dev/null
  aws iam add-role-to-instance-profile \
    --instance-profile-name "${PROFILE_NAME}" \
    --role-name "${ROLE_NAME}"
  success "Instance profile created and role attached"
  info "Waiting 10s for IAM profile to propagate..."
  sleep 10
fi

# ── Launch EC2 Instance ──────────────────────────────────────────────────────
info "Launching EC2 instance (${INSTANCE_TYPE}, ${AMI_ID})..."
existing_instance=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${INSTANCE_TAG}" "Name=instance-state-name,Values=running,stopped,pending" \
  --region "${REGION}" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null)

if [ "${existing_instance}" != "None" ] && [ -n "${existing_instance}" ]; then
  warn "Instance with tag '${INSTANCE_TAG}' already exists: ${existing_instance}"
  INSTANCE_ID="${existing_instance}"
else
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "${AMI_ID}" \
    --count 1 \
    --instance-type "${INSTANCE_TYPE}" \
    --key-name "${KEY_NAME}" \
    --security-group-ids "${SG_ID}" \
    --iam-instance-profile "Name=${PROFILE_NAME}" \
    --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":${EBS_SIZE},\"VolumeType\":\"gp3\"}}]" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_TAG}},{Key=Project,Value=kentron}]" \
    --region "${REGION}" \
    --query 'Instances[0].InstanceId' \
    --output text)
  success "Instance launched: ${INSTANCE_ID}"

  info "Waiting for instance to reach running state..."
  aws ec2 wait instance-running --instance-ids "${INSTANCE_ID}" --region "${REGION}"
  success "Instance is running"
fi

# ── Elastic IP ───────────────────────────────────────────────────────────────
info "Allocating Elastic IP..."
existing_eip=$(aws ec2 describe-addresses \
  --filters "Name=tag:Name,Values=${INSTANCE_TAG}" \
  --region "${REGION}" \
  --query 'Addresses[0].AllocationId' \
  --output text 2>/dev/null)

if [ "${existing_eip}" != "None" ] && [ -n "${existing_eip}" ]; then
  warn "Elastic IP already allocated (${existing_eip})"
  ALLOC_ID="${existing_eip}"
else
  ALLOC_ID=$(aws ec2 allocate-address \
    --domain vpc \
    --region "${REGION}" \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${INSTANCE_TAG}}]" \
    --query 'AllocationId' \
    --output text)
  success "Elastic IP allocated: ${ALLOC_ID}"
fi

PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids "${ALLOC_ID}" \
  --region "${REGION}" \
  --query 'Addresses[0].PublicIp' \
  --output text)

# Associate if not already associated
ASSOC_INSTANCE=$(aws ec2 describe-addresses \
  --allocation-ids "${ALLOC_ID}" \
  --region "${REGION}" \
  --query 'Addresses[0].InstanceId' \
  --output text 2>/dev/null)

if [ "${ASSOC_INSTANCE}" = "${INSTANCE_ID}" ]; then
  warn "Elastic IP already associated with this instance"
elif [ "${ASSOC_INSTANCE}" = "None" ] || [ -z "${ASSOC_INSTANCE}" ]; then
  aws ec2 associate-address \
    --instance-id "${INSTANCE_ID}" \
    --allocation-id "${ALLOC_ID}" \
    --region "${REGION}" \
    --no-cli-pager > /dev/null
  success "Elastic IP ${PUBLIC_IP} associated with ${INSTANCE_ID}"
else
  warn "Elastic IP is associated with a different instance: ${ASSOC_INSTANCE}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Provision Complete!                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
success "Instance ID:   ${INSTANCE_ID}"
success "Public IP:     ${PUBLIC_IP}"
success "Key file:      ${KEY_FILE}"
echo ""
echo "Next steps:"
echo "  1. Update DNS: app.kentron.ai  A  ${PUBLIC_IP}"
echo "  2. Wait 2 min for SSH to be ready, then run:"
echo "     bash infra/aws/bootstrap.sh ${PUBLIC_IP}"
echo "  3. After bootstrap, run:"
echo "     bash infra/aws/deploy.sh ${PUBLIC_IP}"
echo ""

# Save IP to file for other scripts
echo "${PUBLIC_IP}" > "$(dirname "$0")/.ec2_ip"
echo "${INSTANCE_ID}" > "$(dirname "$0")/.ec2_instance_id"
