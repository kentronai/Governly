# AWS EC2 Deployment — Kentron

Deploys all Kentron services to a single `t3.2xlarge` EC2 instance in `us-east-1` using Docker Compose.

## Prerequisites

### 1. Generate AWS Access Keys (one-time)

1. Go to [AWS Console](https://console.aws.amazon.com) → sign in as `drathi`
2. Click username (top-right) → **Security credentials**
3. Scroll to **Access keys** → **Create access key** → select **CLI** → **Create**
4. Download the CSV (contains `Access Key ID` and `Secret Access Key`)
5. Configure locally:
   ```bash
   aws configure
   # AWS Access Key ID: <from CSV>
   # AWS Secret Access Key: <from CSV>
   # Default region name: us-east-1
   # Default output format: json
   ```
6. Verify: `aws sts get-caller-identity`

### 2. Prepare `.env.prod`

Ensure `<project-root>/.env.prod` has the correct production values:
```
DATABASE_URL=postgresql://postgres:<STRONG_PASSWORD>@postgres:5432/ai_governance
POSTGRES_PASSWORD=<STRONG_PASSWORD>
REDIS_URL=redis://redis:6379
NEXT_PUBLIC_BACKEND_URL=https://app.kentron.ai
NEXT_PUBLIC_API_URL=https://app.kentron.ai
NEXT_PUBLIC_APP_URL=https://app.kentron.ai
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
OPENAI_API_KEY=sk-...
HF_TOKEN=hf_...
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<32-byte hex>
```

---

## Deployment Steps

### Phase 1 — Provision AWS Resources

```bash
cd <project-root>
bash infra/aws/provision.sh
```

Creates: EC2 instance, Security Group, Elastic IP, IAM Role, Key Pair.  
Outputs the EC2 public IP and saves it to `infra/aws/.ec2_ip`.

### Phase 2 — Bootstrap EC2

```bash
bash infra/aws/bootstrap.sh <EC2_IP>
```

Installs Docker, Docker Compose, git, certbot, AWS CLI on the EC2 instance.

### Phase 3 — Point DNS

In your DNS provider:
```
app.kentron.ai   A   <Elastic IP>
```
Wait ~5 minutes for propagation before proceeding to SSL.

### Phase 4 — Deploy Application

```bash
bash infra/aws/deploy.sh
# or: bash infra/aws/deploy.sh <EC2_IP>
```

Syncs code, builds Docker images on EC2, starts all containers, waits for Postgres to be healthy, then runs Drizzle migrations.

App will be live at `http://<EC2_IP>` immediately.

### Phase 5 — Enable HTTPS

After DNS is propagated:
```bash
bash infra/aws/ssl-setup.sh
# or: bash infra/aws/ssl-setup.sh <EC2_IP>
```

Obtains Let's Encrypt cert for `app.kentron.ai`, updates nginx config, sets up auto-renewal cron.

App will be live at `https://app.kentron.ai`.

---

## Services

| Container | Port (internal) | Description |
|-----------|----------------|-------------|
| nginx | 80, 443 | Reverse proxy + SSL termination |
| web | 8080 | Next.js 15 web app |
| controlnet | 8000 | ControlNet Gateway (FastAPI) |
| model-guard | 8001 | ModelGuard service |
| onnx-service | 8002 | ONNX inference service |
| postgres | 5432 | PostgreSQL 15 (internal only) |
| redis | 6379 | Redis 7 (internal only) |

---

## Common Operations

```bash
# SSH into EC2
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP>

# View all service logs
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP> \
  'cd /opt/kentron && sudo docker compose logs -f'

# View specific service logs
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP> \
  'cd /opt/kentron && sudo docker compose logs -f web'

# Check service status
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP> \
  'cd /opt/kentron && sudo docker compose ps'

# Restart all services
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP> \
  'cd /opt/kentron && sudo docker compose restart'

# Run Drizzle migrations manually
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP> \
  'cd /opt/kentron && sudo docker compose exec web pnpm db:migrate'

# Redeploy (after code changes)
bash infra/aws/deploy.sh
```

---

## AWS Resources Created

| Resource | Name | Notes |
|----------|------|-------|
| EC2 Instance | `kentron-production` | t3.2xlarge, Ubuntu 22.04, 60GB EBS |
| Elastic IP | `kentron-production` | Static, billed even when stopped |
| Security Group | `kentron-sg` | SSH from deployer IP, HTTP, HTTPS |
| IAM Role | `kentron-ec2-role` | AmazonS3ReadOnlyAccess |
| IAM Instance Profile | `kentron-ec2-profile` | Attached to EC2 |
| Key Pair | `kentron-deployer` | PEM saved at `infra/aws/kentron-deployer.pem` |

---

## Security Notes

- `infra/aws/kentron-deployer.pem` — **never commit this file** (it's in .gitignore)
- `.env.prod` — **never commit** (in .gitignore)
- PostgreSQL and Redis are not exposed to the public internet
- EC2 uses IAM Instance Profile for S3 access (no long-lived credentials on the instance)
