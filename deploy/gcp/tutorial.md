# Deploy Governly to Google Cloud

This creates one Compute Engine VM (4 vCPU / 16 GB), installs Governly on it and prints its URL.

You need a Clerk app's two keys from https://dashboard.clerk.com (API Keys).

## Pick a project

<walkthrough-project-setup billing="true"></walkthrough-project-setup>

```sh
gcloud config set project <walkthrough-project-id/>
```

## Deploy

```sh
bash deploy/gcp/deploy.sh
```

It asks for the two Clerk keys, then streams the install (10-20 minutes the first time). If the
install fails, the VM is deleted so nothing is left running.

## Done

Open the printed URL, add it to your Clerk app's allowed origins and sign up.

To update later, run `bash deploy/gcp/deploy.sh` again: it upgrades the same VM in place.
