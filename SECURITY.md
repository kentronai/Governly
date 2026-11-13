# Security policy

## Reporting a vulnerability

Please **do not** open a public issue, pull request or discussion for a security problem.

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/kentronai/Norix/security/advisories/new)**
(Security tab → Report a vulnerability).

Include what you found, the affected version or commit, and steps to reproduce. We aim to acknowledge
reports within 3 working days and to agree a disclosure date with you once a fix is ready.

## Supported versions

Security fixes land on `main`. Self-hosters should upgrade with `git pull && ./install.sh`.

## Scope

In scope: this repository's code, the Docker images it builds, and the default self-host setup
(`install.sh`, `deploy/`).

Out of scope: third-party services NORIX connects to (Clerk, Nango, cloud providers, LLM providers),
and deployments that changed the defaults in ways this repo does not document.

## Hardening checklist for self-hosters

- Put HTTPS in front before exposing NORIX (see [docs/self-hosting.md](docs/self-hosting.md#https)).
- Keep `.env` private (`chmod 600`) and backed up. Its keys encrypt stored credentials.
- Change `NANGO_DASHBOARD_PASSWORD` if you set it by hand. The installer generates a random one.
- Do not publish Postgres, Redis or Nango ports. The default compose file keeps them internal.
