# Kentron — AWS EC2 Deployment / Redeploy Runbook

Deploys the Kentron platform (**all services except ModelGuard**) to a single EC2
instance via Docker Compose, on AWS account **942521690682** (`us-east-1`).

Last verified: **2026-07-26** — full redeploy of a fresh `git pull` succeeded end-to-end.

---

## 0. Facts / current deployment

| Item | Value |
|---|---|
| AWS CLI profile | `kentron-new` (account 942521690682, IAM user `drathi`). **Never** use `default`/`kentron`. |
| Region | `us-east-1` |
| EC2 instance | `kentron-production` = `i-048cde14cfd334ca5`, `t3.2xlarge`, Ubuntu 22.04, 60 GB gp3 |
| Public IP (Elastic) | `98.88.103.48` |
| App URL | **`https://app.kentron.ai`** (DNS A record → `98.88.103.48`; Let's Encrypt TLS live, HTTP→HTTPS redirect) |
| Security group | `kentron-sg` = `sg-03f4bb09a4130626d` (22 from operator IPs, 80/443 public) |
| SSH | `ssh -i infra/aws/kentron-deployer.pem ubuntu@98.88.103.48` |
| Remote app dir | `/opt/kentron` (file-copy via rsync, **not** a git repo) |
| S3 bucket | `kentron-ai-governance-prod` (private; see §7) |
| Services (7) | nginx, web, controlnet, onnx-service, postgres, redis, **agent-discovery-scheduler** |

> The operator's SSH source IP rotates (mobile). If SSH times out, re-authorize:
> `MYIP=$(curl -s https://checkip.amazonaws.com); AWS_PROFILE=kentron-new aws ec2 authorize-security-group-ingress --group-id sg-03f4bb09a4130626d --region us-east-1 --protocol tcp --port 22 --cidr ${MYIP}/32`

---

## 1. Prerequisites (one-time)

1. **AWS CLI profile** — a dedicated profile so it never collides with other accounts:
   ```bash
   aws configure set aws_access_key_id     <KEY>    --profile kentron-new
   aws configure set aws_secret_access_key <SECRET> --profile kentron-new
   aws configure set region us-east-1               --profile kentron-new
   aws sts get-caller-identity --profile kentron-new   # must show 942521690682
   ```
2. **`.env`** at the repo root — the single source of config for every service
   (`env_file: .env` in `docker-compose.yml`). Must contain, at minimum:
   `ENVIRONMENT, LOG_LEVEL, DATABASE_URL, POSTGRES_PASSWORD, REDIS_URL,
   S3_MODEL_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
   OPENAI_API_KEY, HF_TOKEN, CLERK_* , NEXT_PUBLIC_* , NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
   `deploy.sh` auto-generates `AGENT_DISCOVERY_CRON_SECRET` if missing.
   `.env` is gitignored — **never commit it**.
3. **SSH key** — `infra/aws/kentron-deployer.pem` (chmod 400). Old-account copies are
   preserved under `infra/aws/old-account-backup/`.

---

## 2. Provision AWS resources (only for a brand-new instance)

```bash
AWS_PROFILE=kentron-new bash infra/aws/provision.sh
AWS_PROFILE=kentron-new bash infra/aws/bootstrap.sh $(cat infra/aws/.ec2_ip)
```
`provision.sh` resolves the current Ubuntu 22.04 AMI dynamically (SSM), creates the
key pair / SG / IAM role+profile / instance / Elastic IP, and writes `.ec2_ip` +
`.ec2_instance_id`. `bootstrap.sh` installs Docker, the compose plugin, git and Node.

**Skip this section for a redeploy** — the instance already exists.

---

## 3. Redeploy (the common path)

```bash
bash infra/aws/deploy.sh          # reads infra/aws/.ec2_ip
```
`deploy.sh` does: generate `AGENT_DISCOVERY_CRON_SECRET` → rsync repo to `/opt/kentron`
→ copy `.env` → `docker compose build --pull` → `up -d` → wait for Postgres → run
Drizzle migrations in a one-off container.

**After `deploy.sh` completes you MUST restart nginx** (see §5, "nginx upstreams").

### Faster iteration when only the web app changed
Building web is the slow part (~8–10 min). To rebuild just web:
```bash
ssh -i infra/aws/kentron-deployer.pem ubuntu@<IP> \
  'cd /opt/kentron && sudo docker compose build web && sudo docker compose up -d && sudo docker compose restart nginx'
```

---

## 4. Database migrations

Schema is owned by `apps/web/drizzle/` (Drizzle). Run migrations in a one-off Node
container on the compose network (the web runner image has no pnpm/drizzle-kit, and
the default `db:migrate` forces SSL against the non-TLS compose Postgres):

```bash
ssh -i infra/aws/kentron-deployer.pem ubuntu@<IP> \
  "cd /opt/kentron && sudo docker run --rm --network controlnet-network \
   --env-file /opt/kentron/.env -e DB_SSL=false -v /opt/kentron:/repo -w /repo \
   node:20-bookworm bash -c 'corepack enable && corepack prepare pnpm@9.0.0 --activate && \
     pnpm install --no-frozen-lockfile --filter @ai-governance/web... && \
     cd apps/web && pnpm exec drizzle-kit migrate --config=src/drizzle.config.env.ts'"
```
- Use `src/drizzle.config.env.ts` (honours `DB_SSL=false`), **not** the default config.
- Use `--no-frozen-lockfile` — the root `pnpm-lock.yaml` can lag `apps/web/package.json`.
- Verify: `select count(*) from drizzle."__drizzle_migrations";` should equal the number
  of `apps/web/drizzle/*.sql` files (31 as of 2026-07-26). `NOTICE ... already exists`
  lines during apply are idempotent guards, not errors.

**Seed the marketplace guardrail catalog** (otherwise the marketplace is empty):
```bash
ssh -i infra/aws/kentron-deployer.pem ubuntu@<IP> \
  "cd /opt/kentron && sudo docker run --rm --network controlnet-network \
   --env-file /opt/kentron/.env -e DB_SSL=false -v /opt/kentron:/repo -w /repo/apps/web \
   node:20-bookworm bash -c 'corepack enable && corepack prepare pnpm@9.0.0 --activate && \
     pnpm dlx tsx scripts/seed-marketplace.ts'"
```

---

## 5. Codebase-specific fixes baked into this deployment

These are **working-tree edits** (uncommitted, per project policy). Keep them when
re-syncing; they are why the build/deploy succeeds.

1. **ModelGuard excluded** — `docker-compose.yml` has no `model-guard` service and nginx
   does not `depends_on` it; `nginx.conf` returns a static `503` for `/modelguard/`
   (instead of an unresolvable `upstream`, which would crash-loop nginx).

2. **Web image build (`apps/web/Dockerfile`)** — the committed `apps/web/package-lock.json`
   was generated on macOS, so `npm ci` installs darwin native binaries but **not** the
   `linux-x64-musl` ones this Alpine image needs (npm/cli#4828). After `npm ci`, the
   Dockerfile explicitly installs the musl binaries for the exact installed versions:
   ```
   npm ci
   npm install --no-save "lightningcss-linux-x64-musl@$(node -p "require('lightningcss/package.json').version")" \
                         "@tailwindcss/oxide-linux-x64-musl@$(node -p "require('@tailwindcss/oxide/package.json').version")"
   ```
   Symptom if missing: `Cannot find module '../lightningcss.linux-x64-musl.node'`.

3. **Path-alias resolution (`apps/web/next.config.js`)** — this production (webpack) build
   was **not** applying tsconfig `paths`, so every `@/...` and `@db` import failed
   (`Module not found`). Fixed by mirroring the tsconfig paths as webpack aliases:
   ```js
   config.resolve.alias = { ...config.resolve.alias,
     "@db": path.resolve(__dirname, "src/db/index.ts"),
     "@":   path.resolve(__dirname, "src") };
   ```
   (The bare `"@"` alias only matches `@`/`@/…` segments, so `@clerk/*`, `@radix-ui/*`,
   `@tanstack/*` scoped packages are unaffected.)

4. **Two typo imports** — `src/app/[tenant]/ai-console/layout.tsx` and
   `src/app/[tenant]/applications/[applicationId]/control-net/red-teaming/layout.tsx`
   imported `{ db, tenants } from "drizzle"` (no such module) → changed to `from "@db"`.

5. **Migration step** in `deploy.sh` uses the one-off Node container from §4
   (the original `docker compose exec web pnpm db:migrate` cannot work).

6. **rsync `--delete` vs root-owned files** — the one-off Node containers create a
   root-owned `.pnpm-store` (and `node_modules`) under `/opt/kentron`; `deploy.sh`'s
   rsync runs as `ubuntu` and cannot delete them. `deploy.sh` now excludes `.pnpm-store`.
   If rsync still hits `Permission denied`, clean up once:
   `ssh … 'sudo rm -rf /opt/kentron/.pnpm-store /opt/kentron/node_modules /opt/kentron/apps/web/node_modules && sudo chown -R ubuntu:ubuntu /opt/kentron'`

7. **nginx upstreams (do after every `up -d`)** — nginx caches upstream container IPs at
   startup. Recreating controlnet/onnx/web gives them new IPs, so nginx returns **502**
   for all proxied routes (and its `/healthz`, which proxies to onnx, goes unhealthy).
   Fix: `sudo docker compose restart nginx`.

---

## 5b. HTTPS / TLS (already live)

`https://app.kentron.ai` is live with a Let's Encrypt cert (auto-renews). How it was set up
(do **not** run the stock `ssl-setup.sh` blindly — see the warning below):

1. DNS: `app.kentron.ai` A record → `98.88.103.48` (done).
2. Cert (certbot standalone needs port 80, so stop nginx briefly):
   ```bash
   ssh … 'cd /opt/kentron && sudo docker compose stop nginx'
   ssh … 'sudo certbot certonly --standalone --non-interactive --agree-tos --email satish@kentron.ai -d app.kentron.ai'
   ```
3. The repo `nginx.conf` **is** the HTTPS config: HTTP :80 (healthz + ACME + 301→HTTPS) and
   HTTPS :443 (cert from `/etc/letsencrypt/live/app.kentron.ai/`, same routes as before,
   ModelGuard still a 503). `docker-compose.yml` already publishes 443 and mounts
   `/etc/letsencrypt:ro`. Start nginx: `sudo docker compose up -d nginx`.
4. Auto-renewal: hooks at `/etc/letsencrypt/renewal-hooks/{pre/stop-nginx.sh,post/start-nginx.sh}`
   stop/start nginx so certbot's standalone renewal can bind :80. Verified with
   `sudo certbot renew --dry-run`.

> **⚠️ Do NOT run the original `ssl-setup.sh` flow blindly.** Its embedded nginx config
> historically re-added a `model-guard` upstream (crash-loops nginx) and used a different
> route table. It has been patched to drop ModelGuard, but the repo `nginx.conf` is now the
> canonical HTTPS config — prefer editing that. The cert lives in `/etc/letsencrypt` (host
> path, survives redeploys); a **fresh** instance must obtain the cert (step 2) before nginx
> can start with the SSL config, or nginx will fail to load a missing certificate.

---

## 6. Clerk

Production Clerk instance `ins_34dHU2JPt3P4XlRzLLyEirRoR8x`, Frontend API `clerk.kentron.ai`
(live and independent of `app.kentron.ai`). The keys in `.env` are the correct production
keys. To re-verify connectivity:
```bash
# JWKS the gateway uses to verify JWTs
curl -s https://clerk.kentron.ai/.well-known/jwks.json | head -c 120
# secret-key auth against the Backend API (run from a container that has CLERK_SECRET_KEY)
ssh … 'cd /opt/kentron && sudo docker compose exec -T web node -e "fetch(\"https://api.clerk.com/v1/jwks\",{headers:{Authorization:\"Bearer \"+process.env.CLERK_SECRET_KEY}}).then(r=>console.log(r.status))"'
```
Both should return 200 with the same instance `kid`. Full browser-based sign-in is only
verifiable after DNS is cut over to `app.kentron.ai` + HTTPS (`ssl-setup.sh`).

---

## 7. S3

Bucket `kentron-ai-governance-prod` (account 942521690682, private). The account has
**account-level Block Public Access** (`BlockPublicPolicy`/`RestrictPublicBuckets=true`)
and is shared with other production workloads, so the `static/*` public-read policy
cannot be applied without a org-level change — **left private on purpose**. The private
role (controlnet policy/model/LanceDB access via credentials) works and is validated by a
put/get/delete round-trip. `web`'s baked `NEXT_PUBLIC_STATIC_FILES_BUCKET` now points at
this bucket; public static assets would need CloudFront+OAC (out of scope).

---

## 8. Validation matrix (run after every deploy)

```bash
IP=98.88.103.48
curl -s -o /dev/null -w 'nginx /healthz: %{http_code}\n'      http://$IP/healthz     # 200
curl -s -o /dev/null -w 'controlnet /docs: %{http_code}\n'    http://$IP/docs        # 200
curl -s -o /dev/null -w 'web /: %{http_code}\n'               http://$IP/            # 307
curl -s -X POST http://$IP/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"x","messages":[]}'   # structured 401 JSON
curl -s -o /dev/null -w 'modelguard: %{http_code}\n'          http://$IP/modelguard/scan  # 503
# internal + data:
ssh … 'cd /opt/kentron && sudo docker compose ps'             # 7 services, web/controlnet/onnx/nginx/pg/redis healthy
ssh … 'cd /opt/kentron && sudo docker compose exec -T web wget -qO- http://controlnet:8000/healthz'   # {"status":"healthy"}
# agent-discovery cron route (needs the bearer secret):
ssh … 'cd /opt/kentron && SEC=$(grep ^AGENT_DISCOVERY_CRON_SECRET= .env | cut -d= -f2); sudo docker compose exec -T web wget -qO- --header="Authorization: Bearer $SEC" http://127.0.0.1:8080/api/cron/agent-discovery'  # {"completedAt":...}
# backend ports must NOT be public:
for p in 5432 8000 8002; do nc -z -G3 $IP $p && echo "$p OPEN(BAD)" || echo "$p refused(GOOD)"; done
```

**Accepted limitations (by design for this IP-only dev deployment):** full Clerk browser
login needs DNS+HTTPS; T2 ONNX guards are inert (0 `onnx_models` rows); some `/static/*`
assets 404 (private bucket / no assets); `NEXT_PUBLIC_BASE_URL*` still point at GCP-era
hosts as provided in `.env`.

---

## 9. Common operations

```bash
IP=98.88.103.48 ; K=infra/aws/kentron-deployer.pem
ssh -i $K ubuntu@$IP 'cd /opt/kentron && sudo docker compose ps'
ssh -i $K ubuntu@$IP 'cd /opt/kentron && sudo docker compose logs -f web'      # or controlnet / nginx / …
ssh -i $K ubuntu@$IP 'cd /opt/kentron && sudo docker compose restart nginx'    # after any recreate
```
