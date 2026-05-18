# AWS EC2 Deployment Design
**Date:** 2026-05-18  
**Status:** Approved  
**Author:** Dishant Rathi

## Summary

Deploy the full Kentron AI Governance Platform to a single fresh AWS EC2 `t3.2xlarge` instance in `us-east-1`. All services run via the existing `docker-compose.yml`. Domain `app.kentron.ai` points to a static Elastic IP with HTTPS via Let's Encrypt.

---

## Architecture

```
Internet
    │
    ▼
app.kentron.ai  ──►  Elastic IP (static, attached to EC2)
                          │
                     EC2 t3.2xlarge (Ubuntu 22.04 LTS, us-east-1)
                     ├── Security Group
                     │   ├── 443/tcp  HTTPS (0.0.0.0/0)
                     │   ├── 80/tcp   HTTP → redirect to HTTPS
                     │   └── 22/tcp   SSH (restricted to deployer IP)
                     │
                     └── Docker Compose (controlnet-network)
                         ├── nginx  ← ports 80 + 443 (SSL termination)
                         ├── web  (Next.js :8080, internal)
                         ├── controlnet  (:8000, internal)
                         ├── model-guard  (:8001, internal)
                         ├── onnx-service  (:8002, internal)
                         ├── postgres  (:5432, Docker named volume)
                         └── redis  (:6379, Docker named volume)
```

**IAM:** EC2 gets an Instance Profile with `AmazonS3ReadOnlyAccess` for ONNX model bucket access. No long-lived credentials stored on the instance.

---

## AWS Resources

| Resource | Spec | Notes |
|----------|------|-------|
| EC2 Instance | t3.2xlarge, Ubuntu 22.04 LTS | ami-0c7217cdde317cfec (us-east-1) |
| EBS Volume | 60 GB gp3 | OS + Docker images + volumes |
| Elastic IP | us-east-1 | Static, attached at provision time |
| Security Group | `kentron-sg` | SSH (deployer IP), HTTP, HTTPS |
| IAM Role | `kentron-ec2-role` | AmazonS3ReadOnlyAccess |
| IAM Instance Profile | `kentron-ec2-profile` | Attached to EC2 |
| Key Pair | `kentron-deployer` | Private key saved locally as `infra/aws/kentron-deployer.pem` |

---

## Files to Create

All new files live in `infra/aws/`.

### `infra/aws/README.md`
Step-by-step operator guide covering all phases.

### `infra/aws/provision.sh`
**Runs from local machine.** Uses AWS CLI to:
1. Create key pair → saves `infra/aws/kentron-deployer.pem`
2. Create security group `kentron-sg` with ingress rules
3. Create IAM role + instance profile with S3 read access
4. Launch EC2 instance (t3.2xlarge, Ubuntu 22.04, 60GB EBS)
5. Allocate Elastic IP → associate with instance
6. Output instance public IP and SSH command

### `infra/aws/bootstrap.sh`
**Runs on EC2 via SSH.** Installs:
- Docker CE (latest stable)
- Docker Compose plugin
- git
- AWS CLI v2
- certbot (for Let's Encrypt SSL)
- Creates `/opt/kentron/` deployment directory

### `infra/aws/deploy.sh`
**Runs from local machine.** Steps:
1. Validates `.env.prod` exists locally
2. rsyncs project files to `/opt/kentron/` on EC2
3. Copies `.env.prod` to `/opt/kentron/.env` on EC2
4. SSHes in and runs: `docker compose build --pull`
5. Runs: `docker compose up -d`
6. Waits for postgres healthcheck to pass
7. Runs Drizzle migrations: `docker compose exec web pnpm db:migrate`
8. Prints service status and health

### `infra/aws/ssl-setup.sh`
**Runs on EC2 via SSH.** Steps:
1. Stops nginx container temporarily
2. Runs `certbot certonly --standalone -d app.kentron.ai`
3. Mounts `/etc/letsencrypt` into nginx container (via docker-compose override)
4. Restarts nginx with SSL config
5. Sets up certbot auto-renewal cron: `0 0 * * * certbot renew --deploy-hook "docker compose -f /opt/kentron/docker-compose.yml restart nginx"`

---

## docker-compose.yml Changes

1. **nginx service:** Add port `443:443`, mount `/etc/letsencrypt:/etc/letsencrypt:ro`
2. **No other service changes** — postgres, redis, and app services are unchanged

---

## nginx.conf Changes

Add HTTPS server block alongside existing HTTP block:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name app.kentron.ai;
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    server_name app.kentron.ai;
    ssl_certificate /etc/letsencrypt/live/app.kentron.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.kentron.ai/privkey.pem;
    # ... existing proxy_pass rules unchanged ...
}
```

---

## Environment Variables

`.env.prod` is copied to EC2 as `/opt/kentron/.env`. It is never committed to git.

Key values that must be correct for EC2:
```
DATABASE_URL=postgresql://postgres:<STRONG_PASSWORD>@postgres:5432/ai_governance
REDIS_URL=redis://redis:6379
NEXT_PUBLIC_BACKEND_URL=https://app.kentron.ai
NEXT_PUBLIC_API_URL=https://app.kentron.ai
NEXT_PUBLIC_APP_URL=https://app.kentron.ai
POSTGRES_PASSWORD=<STRONG_PASSWORD>
```

---

## Drizzle Migrations

Run after `docker compose up -d` and postgres is healthy:

```bash
docker compose exec web pnpm db:migrate
```

This uses `src/drizzle.config.ts` (not `drizzle.config.prod.ts`) which reads `DATABASE_URL` from the container's environment without requiring SSL — correct for Docker-internal Postgres. The web container can reach the postgres container on the `controlnet-network` internal bridge.

---

## Deployment Sequence

### Phase 0: Prerequisites (manual, one-time)
1. Log into AWS Console → IAM → Users → `drathi` → Security credentials
2. Create Access Key → download CSV
3. Run `aws configure` on local machine with the new keys
4. Ensure `.env.prod` is up-to-date locally

### Phase 1: Provision AWS Resources
```bash
cd infra/aws && bash provision.sh
```
Outputs: EC2 IP, SSH command

### Phase 2: Bootstrap EC2
```bash
ssh -i infra/aws/kentron-deployer.pem ubuntu@<EC2_IP>
# Then run:
bash /tmp/bootstrap.sh
```

### Phase 3: Point DNS
In your DNS provider, create/update:  
`app.kentron.ai  A  <Elastic IP>`

### Phase 4: Deploy Application
```bash
cd infra/aws && bash deploy.sh
```
App live at `http://app.kentron.ai` (HTTP only at this stage)

### Phase 5: Enable HTTPS
```bash
bash ssl-setup.sh
```
App live at `https://app.kentron.ai`

---

## Security Notes

- SSH access restricted to deployer's IP in security group
- EC2 uses IAM Instance Profile for S3 — no credentials in `.env`
- `.env.prod` is never committed to git (in `.gitignore`)
- PostgreSQL and Redis ports are internal-only (no host port mapping)
- Certbot auto-renews SSL cert via cron

---

## Out of Scope

- CI/CD pipeline (can be added in a follow-up)
- PostgreSQL backups (EC2 EBS snapshots should be configured manually via AWS Console)
- CloudWatch monitoring (can be added later)
- Multi-AZ / HA setup (single EC2 is sufficient for current scale)
