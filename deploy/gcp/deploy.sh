#!/usr/bin/env bash
# Deploy Governly to a Google Compute Engine VM from Cloud Shell (or any machine with gcloud).
# Re-run to redeploy: if the VM exists it pulls the latest code and upgrades in place.
#
#   GOVERNLY_INSTANCE (default governly)  GCP_ZONE (default us-central1-a)
#   GCP_MACHINE_TYPE  (default e2-standard-4: 4 vCPU / 16 GB)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY   prompted for if unset
set -euo pipefail
NAME="${GOVERNLY_INSTANCE:-governly}" ZONE="${GCP_ZONE:-us-central1-a}" TYPE="${GCP_MACHINE_TYPE:-e2-standard-4}"
gc() { gcloud "$@" --quiet; }

PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "Pick a project first: gcloud config set project <id>" >&2; exit 1; }
echo "==> Project $PROJECT, VM $NAME in $ZONE"
gc services enable compute.googleapis.com

gc compute firewall-rules describe governly-http >/dev/null 2>&1 \
  || gc compute firewall-rules create governly-http --allow tcp:80 --target-tags governly

created=0
if ! gc compute instances describe "$NAME" --zone "$ZONE" >/dev/null 2>&1; then
  [ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ] || read -r -p "Clerk publishable key (pk_...): " NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  [ -n "${CLERK_SECRET_KEY:-}" ] || read -r -s -p "Clerk secret key (sk_...): " CLERK_SECRET_KEY; echo
  echo "==> Creating VM"
  gc compute instances create "$NAME" --zone "$ZONE" --machine-type "$TYPE" --tags governly \
    --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 60GB
  created=1
fi
IP="$(gcloud compute instances describe "$NAME" --zone "$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo "==> Installing Governly on $IP (first run takes 10-20 minutes)"
cmd="curl -fsSL https://raw.githubusercontent.com/kentronai/Norix/main/deploy/vm-init.sh | sudo env GOVERNLY_URL=http://$IP"
[ "$created" = 1 ] && cmd+=" NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY' CLERK_SECRET_KEY='$CLERK_SECRET_KEY'"
for _ in 1 2 3 4 5 6; do gc compute ssh "$NAME" --zone "$ZONE" --command true >/dev/null 2>&1 && break; sleep 10; done
if ! gc compute ssh "$NAME" --zone "$ZONE" --command "$cmd bash"; then
  echo "error: install failed (output above)." >&2
  if [ "$created" = 1 ]; then echo "==> Deleting the VM so nothing is left running"; gc compute instances delete "$NAME" --zone "$ZONE"; fi
  exit 1
fi

curl -fsS "http://$IP/healthz" >/dev/null && echo "
  Governly is running at http://$IP
  Add that URL to your Clerk app's allowed origins, then sign up.
  Redeploy later: bash deploy/gcp/deploy.sh"
