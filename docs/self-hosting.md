# Self-hosting NORIX

NORIX runs as one Docker Compose stack: nginx, the Next.js dashboard, the ControlNet gateway, the ONNX
guard service, three schedulers, Postgres, Redis and a self-hosted Nango. `install.sh` sets it up from
nothing.

- [Requirements](#requirements)
- [Install](#install)
- [Clerk](#clerk)
- [HTTPS](#https)
- [Upgrades](#upgrades)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)

## Requirements

| | Minimum | Recommended |
| --- | --- | --- |
| CPU / RAM | 2 vCPU / 8 GB | 4 vCPU / 16 GB (ML guard models) |
| Disk | 30 GB | 60 GB |
| OS | Linux (Ubuntu 22.04+), macOS | Linux |
| Software | Docker Engine 24+ with Compose 2.24+, git, openssl, curl | |

## Install

On your laptop:

```bash
curl -fsSL https://raw.githubusercontent.com/kentronai/Norix/main/install.sh | bash
```

On a server with a domain (DNS `A` record already pointing at it):

```bash
curl -fsSL https://raw.githubusercontent.com/kentronai/Norix/main/install.sh \
  | NORIX_URL=https://norix.example.com NORIX_HTTP_PORT=8080 bash
```

Then [put HTTPS in front](#https) of port 8080.

What the installer does, in order:

1. Checks Docker, Compose 2.24+, git and openssl.
2. Clones the repo into `~/norix` (`NORIX_DIR`) unless it runs inside a clone.
3. Writes `.env` (mode 600) with freshly generated secrets, after asking for your Clerk keys. An
   existing `.env` is never overwritten.
4. Builds the images, starts Postgres, applies the Drizzle migrations, starts everything.
5. Waits for `NORIX_URL/healthz` and prints next steps.

The installer uses `docker-compose.yml` plus the overlay `deploy/compose.selfhost.yml`, which serves
plain HTTP on `NORIX_HTTP_PORT` and adds the one-shot `migrate` service. To run Compose yourself:

```bash
alias norix='docker compose -f docker-compose.yml -f deploy/compose.selfhost.yml'
norix ps
norix logs -f web
norix run --rm migrate
```

Every setting is listed in [configuration.md](configuration.md).

## Clerk

NORIX uses [Clerk](https://clerk.com) for sign-in, users and organizations. The free tier is enough.

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Turn on **Organizations** (Configure → Organizations).
3. Copy the **Publishable key** and **Secret key** (Configure → API Keys). The installer asks for them.
4. On a public domain, create a **Production** instance and follow Clerk's DNS steps. Development
   keys only work on `localhost`.
5. Optional but recommended, so users and memberships sync immediately: add a webhook
   (Configure → Webhooks) to `NORIX_URL/api/webhooks/clerk` with the `user.*`, `organization.*` and
   `organizationMembership.*` events. Put its signing secret in `.env` as `CLERK_WEBHOOK_SECRET`, then
   re-run `./install.sh`.

## HTTPS

The self-host stack serves HTTP. Put a TLS proxy in front before anyone else uses it. The simplest is
[Caddy](https://caddyserver.com) on the host, which gets and renews certificates by itself:

```bash
# Install NORIX on 8080 so Caddy can own 80/443.
NORIX_URL=https://norix.example.com NORIX_HTTP_PORT=8080 ./install.sh

sudo apt install -y caddy
echo 'norix.example.com {
  reverse_proxy localhost:8080
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

A cloud load balancer (AWS ALB, GCP LB) or Cloudflare Tunnel in front of port 8080 works the same way.
`NORIX_URL` must be the `https://` address people open, because it is baked into the dashboard build.

## Upgrades

```bash
cd ~/norix && git pull && ./install.sh
```

The installer keeps your `.env`, rebuilds the images, applies new migrations and restarts.

## Backups

Everything lives in two places: the `postgres_data` Docker volume and your `.env`.

```bash
# Database (both the app and Nango databases)
docker compose exec -T postgres pg_dumpall -U postgres | gzip > norix-$(date +%F).sql.gz

# Restore into a fresh stack
gunzip -c norix-2026-01-01.sql.gz | docker compose exec -T postgres psql -U postgres
```

Keep a copy of `.env`. `AWS_CREDENTIALS_ENCRYPTION_KEY` and `NANGO_ENCRYPTION_KEY` encrypt stored
credentials: lose them and those credentials are unrecoverable.

## Troubleshooting

Start with `./install.sh --doctor`.

| Symptom | Fix |
| --- | --- |
| `docker compose ... !override` error | Compose is older than 2.24. Upgrade Docker. |
| Port 80 already in use | First install: `NORIX_HTTP_PORT=8080 ./install.sh`. Existing install: set `NORIX_HTTP_PORT=8080` in `.env` (and the URLs, see the last row), re-run `./install.sh`. |
| Sign-in page loops or is blank | The Clerk keys don't match the domain: dev keys on `localhost` only; production keys need Clerk's DNS records. |
| Integrations popup is blank | `NEXT_PUBLIC_NANGO_*` were empty at build time. Fix `.env`, re-run `./install.sh`. |
| `web` unhealthy | `norix logs --tail=100 web`. Most often a missing variable in `.env`. |
| Changed `NORIX_URL` | Edit `NEXT_PUBLIC_*_URL` and `NANGO_*_URL` in `.env`, then re-run `./install.sh` (they are compiled into the dashboard). |

Still stuck? [Open a setup-help issue](https://github.com/kentronai/Norix/issues/new?template=setup_help.yml).
