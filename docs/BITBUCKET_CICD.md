# Bitbucket CI/CD Setup Guide

Simple guide to setup automated deployments from Bitbucket to GCP.

## 🎯 What This Does

- **Main/Master branch**: Automatically deploys to GCP on every commit
- **Pull Requests**: Runs linting/tests only (no deployment)
- **Manual Trigger**: Deploy on-demand via Bitbucket UI

## 🚀 One-Time Setup (5 minutes)

### Step 1: Create GCP Service Account

Run the setup script:

```bash
cd infra/scripts
./setup-bitbucket-cicd.sh
```

This creates a service account and generates two files:
- `bitbucket-cicd-key-{YOUR_PROJECT_ID}.json` (keep secure!)
- `bitbucket-cicd-key-{YOUR_PROJECT_ID}-base64.txt` (use in Bitbucket)

### Step 2: Configure Bitbucket

1. Go to **Repository Settings** → **Pipelines** → **Repository variables**

2. Add these variables:

   | Variable Name | Value | Secured |
   |---------------|-------|---------|
   | `GCP_SERVICE_ACCOUNT_KEY` | Content of `*-base64.txt` file | ✅ Yes |
   | `GCP_PROJECT_ID` | Your GCP Project ID (e.g., `kn-dev-01`) | ❌ No |
   | `GCP_REGION` | `us-central1` | ❌ No |

3. Enable Pipelines:
   - **Repository Settings** → **Pipelines** → **Settings**
   - Toggle **Enable Pipelines**: ON
   - Enable **Docker**: ON (required)

### Step 3: Test It

```bash
# Commit the bitbucket-pipelines.yml
git add bitbucket-pipelines.yml
git commit -m "Add Bitbucket CI/CD pipeline"
git push origin main
```

Check **Pipelines** tab in Bitbucket to see the build progress.

## 🔄 How It Works

```
┌─────────────┐
│  Git Push   │
│  to main    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   Bitbucket     │
│   Pipelines     │
│   (lightweight) │
└──────┬──────────┘
       │ Triggers
       ▼
┌─────────────────┐
│  GCP Cloud      │◄── Uses your existing
│  Build          │    infra/cloudbuild.yaml
│  (heavy lifting)│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Cloud Run      │
│  Services       │
│  - ControlNet   │
│  - ModelGuard   │
│  - Web App      │
└─────────────────┘
```

**Why this approach?**
- ✅ Simple: Bitbucket just triggers Cloud Build
- ✅ Fast: No need to upload entire codebase twice
- ✅ Consistent: Same build process locally and in CI/CD
- ✅ Cost-effective: Cloud Build has 120 free build-minutes/day
- ✅ Secure: Uses service accounts, no long-lived credentials

## 📋 Pipeline Triggers

| Event | Behavior |
|-------|----------|
| Push to `main` or `master` | ✅ Deploy to GCP |
| Pull Request | 🔍 Lint & Test only |
| Manual trigger | 🎛️ Deploy on-demand |

### Manual Deployment

To deploy manually without pushing to main:

1. Go to **Pipelines** → **Run pipeline**
2. Select **Custom: deploy-to-gcp**
3. Click **Run**

## 🔒 Security Best Practices

1. **Service Account Key**:
   - ✅ Store in Bitbucket as secured variable
   - ✅ Keep backup in secure password manager (1Password, LastPass)
   - ❌ Never commit to git
   - ❌ Never share in Slack/email
   - 🔄 Rotate every 90 days

2. **After Setup**:
   ```bash
   # Delete local key files (already uploaded to Bitbucket)
   rm -f bitbucket-cicd-key-*.json
   rm -f bitbucket-cicd-key-*-base64.txt
   ```

## 🛠️ Troubleshooting

### Pipeline fails with "Permission denied"

The service account needs additional roles. Run:

```bash
# Grant missing permissions (replace YOUR_PROJECT_ID)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:bitbucket-cicd@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Build is slow (>15 minutes)

This is normal for first build. Subsequent builds use cache and are faster (~5-10 min).

### Want to test without deploying?

Create a PR instead of pushing to main. PRs only run linting/tests.

## 🎮 Local Development

Local dev is still the fastest way to iterate:

```bash
# Start local environment
./dev up

# Deploy to GCP (local build)
./dev deploy

# Deploy via Cloud Build (same as CI/CD)
./dev deploy:gcp
```

## 📊 Monitoring

**Bitbucket**: View pipeline status in **Pipelines** tab

**GCP Console**: View Cloud Build history
```bash
# Open in browser
gcloud builds list --limit=10

# Or via console (replace YOUR_PROJECT_ID)
open https://console.cloud.google.com/cloud-build/builds?project=YOUR_PROJECT_ID
```

## ⚙️ Advanced: Environments

To add staging environment:

1. Update `bitbucket-pipelines.yml`:
   ```yaml
   branches:
     staging:
       - step:
           <<: *deploy-via-cloud-build
           deployment: staging
   ```

2. Add variable:
   - `GCP_PROJECT_ID_STAGING` = your-staging-project

Keep it simple for now. Add complexity only when needed.

---

**That's it!** Your CI/CD is now automated and leverages GCP's build infrastructure. 🚀

