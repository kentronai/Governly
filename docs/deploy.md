# Deploy to the cloud

Every option runs the same stack as [self-hosting](self-hosting.md). Before you start, create a free
Clerk app at https://dashboard.clerk.com and copy its two keys (publishable `pk_...` and secret
`sk_...`). After the deploy, add Governly's URL to the Clerk app's allowed origins.

| Provider | What it creates | Health check | Redeploy |
| --- | --- | --- | --- |
| [AWS](#aws) | One EC2 VM, CloudFormation stack | `/healthz` | `sudo bash /opt/governly/deploy/vm-init.sh` on the VM |
| [Azure](#azure) | One VM in a resource group | `/healthz` | same, over SSH |
| [Google Cloud](#google-cloud) | One Compute Engine VM | `/healthz` | re-run `deploy/gcp/deploy.sh` |
| [Render](deploy/render.md) | Blueprint: nginx, web, controlnet, Nango, Postgres, Key Value | `/healthz` | push to `main` or **Manual Deploy** |
| [Railway](#railway) | Template: the same services | `/healthz` | push to `main` or **Redeploy** |
| Any Linux server | Whatever you have | `/healthz` | `./install.sh` ([self-hosting](self-hosting.md)) |

The VM options (AWS, Azure, Google Cloud) run the full stack, ML guard models included. Render and
Railway skip the ONNX service and the scheduled jobs, so ML guards, scheduled agent discovery,
AI Radar refreshes and dossier refreshes are off there; everything else works.

All options serve plain HTTP on the address they print. For a real domain and HTTPS, follow
[self-hosting: HTTPS](self-hosting.md#https) on the VMs; Render and Railway serve HTTPS already.

## AWS

1. Download [deploy/aws/governly.yml](../deploy/aws/governly.yml).
2. Open [CloudFormation > Create stack](https://console.aws.amazon.com/cloudformation/home#/stacks/create),
   choose **Upload a template file** and pick it.
3. Fill in the two Clerk keys and create the stack.

The stack stays at `CREATE_IN_PROGRESS` until Governly answers (15-25 minutes), then shows the URL
under **Outputs**. If the install fails, the stack's events show the last lines of the install log
and CloudFormation deletes everything it created.

## Azure

Click **Deploy to Azure** in the [README](../README.md#deploy-it), pick a new resource group, paste
the Clerk keys and your SSH public key, and create. The deployment finishes when Governly is
installed; the URL is under **Outputs**. If it fails, the error shows the install output; delete
the resource group to remove everything.

## Google Cloud

Click **Open in Cloud Shell** in the [README](../README.md#deploy-it) and follow the tutorial, or
from any machine with `gcloud`:

```bash
git clone https://github.com/kentronai/Norix && cd Norix
bash deploy/gcp/deploy.sh   # GCP_ZONE, GCP_MACHINE_TYPE, GOVERNLY_INSTANCE override the defaults
```

The install streams to your terminal. If it fails, the VM is deleted.

## Render

Click **Deploy to Render** in the [README](../README.md#deploy-it). The full walkthrough, from
creating the Clerk app to checking the health URLs, updating and troubleshooting, is in
[Deploy to Render](deploy/render.md).

## Railway

Click **Deploy on Railway** in the [README](../README.md#deploy-it) and paste the Clerk keys.
Railway builds each service, shows its status, and gives `nginx` a public `*.up.railway.app` URL.

To build the template yourself (or to deploy without it), create these services from this repo:

| Service | Source | Variables |
| --- | --- | --- |
| `Postgres`, `Redis` | Railway's database templates | |
| `web` | Root directory `apps/web` (Dockerfile) | shared variables, `RUN_MIGRATIONS=true`, `PORT=8080`, `HOSTNAME=0.0.0.0`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `CONTROLNET_INTERNAL_URL=http://${{controlnet.RAILWAY_PRIVATE_DOMAIN}}:8000`, `NANGO_HOST=http://${{nango.RAILWAY_PRIVATE_DOMAIN}}:3003` |
| `controlnet` | Root directory `apps/controlnet` | shared variables, `PORT=8000`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}` |
| `nango` | `RAILWAY_DOCKERFILE_PATH=deploy/paas/nango.Dockerfile` | shared variables, `PORT=3003`, `NANGO_DB_HOST=${{Postgres.PGHOST}}`, `NANGO_DB_PORT=${{Postgres.PGPORT}}`, `NANGO_DB_NAME=${{Postgres.PGDATABASE}}`, `NANGO_DB_USER=${{Postgres.PGUSER}}`, `NANGO_DB_PASSWORD=${{Postgres.PGPASSWORD}}`, `NANGO_REDIS_URL=${{Redis.REDIS_URL}}` |
| `nginx` (public) | `RAILWAY_DOCKERFILE_PATH=deploy/paas/nginx.Dockerfile`, healthcheck `/healthz` | `PORT=80`, `WEB_HOST=${{web.RAILWAY_PRIVATE_DOMAIN}}`, `CONTROLNET_HOST=${{controlnet.RAILWAY_PRIVATE_DOMAIN}}`, `NANGO_HOSTNAME=${{nango.RAILWAY_PRIVATE_DOMAIN}}` |

Shared variables (project settings):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=        # yours
CLERK_SECRET_KEY=                         # yours
GOVERNLY_URL=https://${{nginx.RAILWAY_PUBLIC_DOMAIN}}
NANGO_SECRET_KEY=${{secret(8, "0123456789abcdef")}}-${{secret(4, "0123456789abcdef")}}-4${{secret(3, "0123456789abcdef")}}-a${{secret(3, "0123456789abcdef")}}-${{secret(12, "0123456789abcdef")}}
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=       # openssl rand -base64 32
AWS_CREDENTIALS_ENCRYPTION_KEY=           # openssl rand -base64 32
NANGO_ENCRYPTION_KEY=                     # openssl rand -base64 32
AGENT_DISCOVERY_CRON_SECRET=${{secret(64, "0123456789abcdef")}}
NANGO_DASHBOARD_PASSWORD=${{secret(24)}}
NEXT_PUBLIC_APP_ENV=production
ENVIRONMENT=production
ENABLE_ONNX_MODELS=false
```

Railway passes these to the Docker builds too, so the web image picks up `GOVERNLY_URL`.
