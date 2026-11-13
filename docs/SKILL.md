---
name: governly-setup
description: Install and run Governly (open-source AI governance platform) on this machine or a server with Docker. Use when asked to set up, install, self-host, deploy or try Governly.
---

# Set up Governly

Governly runs as one Docker Compose stack started by `install.sh`. Ask the person before each step that
changes their machine. Never print, echo or paste a secret key into the chat or a log.

## 1. Check prerequisites

```sh
docker compose version   # needs 2.24 or newer
docker info >/dev/null && echo "daemon ok"
git --version && openssl version
```

If Docker is missing or the daemon is down, tell the person (https://docs.docker.com/get-docker/) and
stop. Note: the stack wants about 8 GB of RAM free.

## 2. Get the code

If the current folder is not already a Governly clone (no `install.sh` and `deploy/compose.selfhost.yml`):

```sh
git clone https://github.com/kentronai/Norix.git governly && cd governly
```

## 3. Clerk keys

Governly signs people in with Clerk. Ask the person to:

1. Create an app at https://dashboard.clerk.com and turn on **Organizations**.
2. Copy the Publishable key (`pk_...`) and Secret key (`sk_...`) from **API Keys**.
3. Export them **in their own terminal**, not in this chat:
   `export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_... CLERK_SECRET_KEY=sk_...`

If they would rather paste them into the installer's prompt, have them run `./install.sh` themselves in
step 4 and wait for them.

## 4. Install

Local machine:

```sh
./install.sh > governly-install.log 2>&1; echo "exit $?"
```

Server with a domain (HTTPS goes in front, see docs/self-hosting.md#https):

```sh
GOVERNLY_URL=https://governly.example.com GOVERNLY_HTTP_PORT=8080 ./install.sh > governly-install.log 2>&1; echo "exit $?"
```

The first build takes 10-20 minutes. If it exits non-zero, show the person the last 40 lines of
`governly-install.log` (they contain no secrets) and check docs/self-hosting.md#troubleshooting.
An existing `.env` is reused, so re-running is safe.

## 5. Verify and hand over

```sh
./install.sh --doctor
```

Tell the person the URL (`NEXT_PUBLIC_APP_URL` in `.env`), that they should open it and sign up, and
that `.env` must be backed up because it holds the encryption keys. For a public domain, point them to
docs/self-hosting.md#https and #clerk (production Clerk instance, webhook).

## Reference

- docs/self-hosting.md: HTTPS, upgrades, backups, troubleshooting
- docs/configuration.md: every `.env` setting
- AGENTS.md: working on the code itself
