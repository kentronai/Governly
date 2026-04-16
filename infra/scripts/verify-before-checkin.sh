#!/bin/bash
# Pre-check-in verification script
# Ensures all fixes are working before committing

set -e

echo "🔍 Pre-Check-in Verification"
echo "============================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASS=0
FAIL=0

# Function to check
check() {
    local name="$1"
    local command="$2"
    
    echo -n "Checking $name... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASS++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAIL++))
        return 1
    fi
}

# 1. Check local environment
echo "📦 Local Environment"
echo "-------------------"
check ".env file exists" "test -f .env"
check "Docker is running" "docker ps"
check "Terraform is installed" "terraform version"
check "gcloud is configured" "gcloud config get-value project"
echo ""

# 2. Check code changes
echo "📝 Code Changes"
echo "--------------"
check "embedding_store.py has ADC logic" "grep -q 'Using Application Default Credentials' apps/controlnet/cga_core/embedding_store.py"
check "Dockerfile removed GCS_CREDENTIALS_PATH" "! grep -q 'GCS_CREDENTIALS_PATH' apps/controlnet/Dockerfile"
check "deploy-controlnet.sh uses Terraform" "grep -q 'terraform apply' infra/scripts/deploy-controlnet.sh"
check "cloudbuild.yaml uses Terraform" "grep -q 'hashicorp/terraform' infra/cloudbuild.yaml"
echo ""

# 3. Check local Docker is working
echo "🐳 Local Docker"
echo "--------------"
if docker-compose ps | grep -q "controlnet-gateway.*Up"; then
    echo -e "${GREEN}✅ PASS${NC} ControlNet container running"
    ((PASS++))
    
    # Check logs for LanceDB
    echo -n "Checking LanceDB initialization... "
    if docker-compose logs controlnet 2>&1 | grep -q "Risk detector ready"; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASS++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAIL++))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} ControlNet not running (run: docker-compose up -d)"
fi
echo ""

# 4. Check GCP deployment (if accessible)
echo "☁️  GCP Deployment"
echo "-----------------"
PROJECT_ID="${GCP_PROJECT_ID:-kn-dev-01}"
if gcloud projects describe $PROJECT_ID > /dev/null 2>&1; then
    # Check latest revision
    echo -n "Checking latest Cloud Run revision... "
    LATEST_REV=$(gcloud run revisions list --service=controlnet-gateway-dev --region=us-central1 --project=$PROJECT_ID --limit=1 --format="value(name)" 2>/dev/null)
    if [ -n "$LATEST_REV" ]; then
        echo -e "${GREEN}✅ PASS${NC} ($LATEST_REV)"
        ((PASS++))
        
        # Check logs for LanceDB
        echo -n "Checking GCP LanceDB logs... "
        if gcloud logging read "resource.labels.revision_name=$LATEST_REV AND textPayload:\"Risk detector ready\"" --limit=1 --project=$PROJECT_ID --format="value(textPayload)" 2>/dev/null | grep -q "Risk detector ready"; then
            echo -e "${GREEN}✅ PASS${NC}"
            ((PASS++))
        else
            echo -e "${RED}❌ FAIL${NC}"
            ((FAIL++))
        fi
        
        # Check for ADC usage
        echo -n "Checking ADC usage... "
        if gcloud logging read "resource.labels.revision_name=$LATEST_REV AND textPayload:\"Using Application Default Credentials\"" --limit=1 --project=$PROJECT_ID --format="value(textPayload)" 2>/dev/null | grep -q "ADC"; then
            echo -e "${GREEN}✅ PASS${NC}"
            ((PASS++))
        else
            echo -e "${RED}❌ FAIL${NC}"
            ((FAIL++))
        fi
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAIL++))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} GCP not accessible"
fi
echo ""

# 5. Check documentation
echo "📚 Documentation"
echo "---------------"
check "infrastructure-parity.md exists" "test -f docs/tech/infrastructure-parity.md"
check "use-terraform-for-deployments.md exists" "test -f docs/tech/use-terraform-for-deployments.md"
check "CHECKIN_SUMMARY.md exists" "test -f CHECKIN_SUMMARY.md"
echo ""

# Summary
echo "============================"
echo -e "📊 Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to check-in.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review changes: git status"
    echo "  2. Add files: git add ."
    echo "  3. Commit: git commit -m 'feat: Add LanceDB ADC support and Terraform deployments'"
    echo "  4. Push: git push"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please fix before checking in.${NC}"
    exit 1
fi

