# Deploy Governly to Render

This guide takes you from nothing to a running Governly on [Render](https://render.com) in about
30 minutes, most of it waiting for builds. You don't need a server, Docker or a terminal.

## What you get

The **Deploy to Render** button reads [`render.yaml`](../../render.yaml) and creates six resources in
your Render account:

| Resource | Type | What it does |
| --- | --- | --- |
| `governly` | Web service (public) | nginx: the address people open. Routes to the services below |
| `governly-web` | Private service | The dashboard (Next.js). Applies database migrations when it starts |
| `governly-controlnet` | Private service | The guardrail gateway (`/v1`, OpenAI-compatible) |
| `governly-nango` | Private service | Self-hosted Nango, which stores integration credentials |
| `governly-db` | Postgres 15 | Governly's data. Nango keeps its tables in its own `nango` schema |
| `governly-redis` | Key Value | Cache for the gateway and Nango |

Only `governly` is reachable from the internet. The rest talk to each other over Render's private
network.

**Not included on Render:** the ML guard models (they need 16 GB of memory) and the scheduled jobs
(daily agent discovery, AI Radar and dossier refreshes). Everything else works. If you need those,
deploy to a VM instead ([AWS, Azure or Google Cloud](../deploy.md)).

## Cost

Render bills per service. With the plans in `render.yaml` it comes to roughly **$110 a month**:
one Starter web service, three Standard private services, Basic-1GB Postgres and Starter Key Value.
Check [render.com/pricing](https://render.com/pricing) for current prices. You can lower a plan
afterwards in each service's **Settings**, but `governly-web` needs at least 2 GB of memory to run.

## Before you start

You need two accounts and three values.

1. **A Render account** with a payment method: https://dashboard.render.com/register.
   Private services have no free plan.
2. **A Clerk app** for sign-in (free): https://dashboard.clerk.com, then **Create application**.
   Open **API Keys** and copy:
   - the **Publishable key** (starts with `pk_`)
   - the **Secret key** (starts with `sk_`)
3. **A UUID** for Nango's secret key. Run `uuidgen` in a terminal (macOS or Linux), or use any
   online UUID generator. Example: `3f2b8c1e-9a4d-4e7f-b2c6-5d8e1a0f7c93`.

## Step 1: open the Blueprint

Click the button in the [README](../../README.md#deploy-it):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kentronai/Norix)

Render shows the Blueprint with the six resources listed above. Give it a name (for example
`governly`).

> **Want automatic updates?** Render can only redeploy automatically from a repository you own.
> Fork https://github.com/kentronai/Norix first, then in Render choose **New > Blueprint** and pick
> your fork instead of using the button.

## Step 2: fill in the four values

Render asks for the values that `render.yaml` marks as yours:

| Variable | What to enter |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your Clerk `pk_...` key |
| `CLERK_SECRET_KEY` | Your Clerk `sk_...` key |
| `NANGO_SECRET_KEY` | The UUID from "Before you start" |
| `GOVERNLY_URL` | `https://governly.onrender.com` for now. Step 4 checks it |

Render generates every other secret: the encryption keys, the cron secret and the Nango dashboard
password. They are stored in the **governly** environment group.

Click **Deploy Blueprint**.

## Step 3: wait for the first deploy

Render builds the four Docker images in parallel. The first build takes 15 to 25 minutes;
`governly-web` is the slowest. Open each service from the dashboard to follow its **Logs** and
**Events**.

The deploy is done when every service shows **Live** (green). In the `governly-web` logs you
should see:

```
[migrate] database is up to date
```

That line means the database tables were created.

## Step 4: set the real URL

Open the `governly` service. Its public address is at the top of the page, under the name.

- **It is `https://governly.onrender.com`:** nothing to do, go to Step 5.
- **It is something else** (for example `https://governly-k3x9.onrender.com`, which Render uses
  when the name is taken):
  1. Go to **Environment Groups > governly**.
  2. Set `GOVERNLY_URL` to that exact address: `https://`, no trailing slash.
  3. Save. Then open `governly-web` and `governly-nango` and click
     **Manual Deploy > Deploy latest commit** on each.
  4. Wait for both to be **Live** again (about 10 minutes for `governly-web`).

This step is needed because the dashboard records its own address when it is built.

## Step 5: allow the URL in Clerk

In the Clerk dashboard, open your app:

1. **Configure > Domains** (or **Allowed origins** on older dashboards): add your Governly URL.
2. With a Clerk **production** instance, also complete Clerk's DNS steps for your domain.
   Development keys (`pk_test_`) work on `onrender.com` right away.

## Step 6: check it works

Open these in a browser or with `curl`, using your URL:

| URL | Expected |
| --- | --- |
| `https://<your-url>/healthz` | `ok`: nginx is up |
| `https://<your-url>/api/health` | `{"status":"ok"}`: the dashboard is up |
| `https://<your-url>/readyz` | A JSON status: the gateway is up |
| `https://<your-url>/` | The sign-in page |

Sign up. The first organization is created for you.

To send LLM traffic through the guardrail gateway, point your OpenAI client at
`https://<your-url>/v1`. See [the API guide](../API.md).

## Updating

- **Forked repo with auto-deploy on:** push to your fork's `main` and Render redeploys the
  services whose files changed.
- **Deployed with the button:** open each service and click **Manual Deploy > Deploy latest
  commit**. Deploy `governly-web` first, since it applies new database migrations.
- **`render.yaml` changed upstream:** open **Blueprints > governly** and click **Manual Sync**.

If a new deploy fails, Render keeps the previous version running, so users are not affected.

## Troubleshooting

| Symptom | Where to look | Fix |
| --- | --- | --- |
| `governly-web` build fails with "JavaScript heap out of memory" or is killed | `governly-web` > Events | Raise the plan to Standard or higher and redeploy |
| `governly-web` keeps restarting, logs show a database error before `[migrate]` | `governly-web` > Logs | Check that `governly-db` is **Available**, then redeploy `governly-web` |
| `502 Bad Gateway` on the site | `governly` > Logs | One private service is not **Live**. Open each one and fix the one that is failing |
| Sign-in page is blank or Clerk says the origin is not allowed | Browser console | Step 5: add the URL to Clerk |
| Sign-in redirects to the wrong address | `GOVERNLY_URL` | Step 4: fix `GOVERNLY_URL`, then redeploy `governly-web` |
| Connecting an integration fails | `governly-nango` > Logs | `NANGO_SECRET_KEY` must be a UUID. Fix it in the environment group, then redeploy `governly-nango` and `governly-web` |

Every service's **Logs** tab shows live output; **Events** shows each deploy and why it failed.

## Removing Governly

Deleting the Blueprint does not delete what it created. To remove everything (including after a
failed first deploy), delete each resource from the dashboard: `governly`, `governly-web`,
`governly-controlnet`, `governly-nango`, `governly-redis` and `governly-db`, then the **governly**
environment group. Deleting `governly-db` deletes all Governly data.
