# SureFix Lite — Frontend Web Application

| | |
|---|---|
| **Student Name** | Shehan Anujaya |
| **Student Number** | __STUDENT_NUMBER__ |
| **Slack Handle** | __SLACK_HANDLE__ |
| **GCP Project ID** | `surefix-eca` |
| **Live URL** | https://surefix-web-71249492828.us-central1.run.app |
| **Module** | ITS 2130 – Enterprise Cloud Architecture (HDSE @ IJSE) |

## Project Description

Minimal web UI for **SureFix Lite** that exercises every backend microservice through the
Spring Cloud API Gateway deployed on Google Cloud Platform:

1. **Bugs** → `bug-service` (PostgreSQL on Cloud SQL)
2. **Runs** → `run-service` (MongoDB API on Firestore) — creating a run also calls bug-service internally
3. **Evidence** → `evidence-service` (Cloud Storage bucket) — upload, preview, download, delete files

The page also links to the Eureka registry (`/registry`) proxied through the gateway.

The frontend is deployed with a **PaaS / serverless** model on **Cloud Run**. nginx serves the static
files and reverse-proxies `/api/**` to the external HTTP load balancer in front of the gateway MIG
(`GATEWAY_URL` env var), so the browser only ever talks to the Cloud Run HTTPS origin.

Related repositories: [Platform parent](https://github.com/shehan-anujaya/surefix-platform) ·
[Services parent](https://github.com/shehan-anujaya/surefix-services)

## Technology Stack

- Plain HTML / CSS / JavaScript (no build step)
- nginx 1.27 (static hosting + reverse proxy, config templated from env vars)
- Docker image built by Cloud Build, deployed to Cloud Run
- GitHub Actions + Workload Identity Federation (`.github/workflows/deploy.yml`)

## Setup / Getting Started

### Run locally
```bash
docker build -t surefix-web .
docker run -p 3000:8080 -e GATEWAY_URL=http://host.docker.internal:8080 surefix-web
# open http://localhost:3000  (gateway + services must be running locally)
```

### Deploy to Cloud Run
```bash
gcloud run deploy surefix-web --source . --region us-central1 --project surefix-eca \
  --allow-unauthenticated --port 8080 --set-env-vars GATEWAY_URL=http://<gateway-load-balancer-ip>
```
Pushing to `main` runs the same command from GitHub Actions using Workload Identity Federation
(repository variables `WIF_PROVIDER`, `DEPLOYER_SA`, `GATEWAY_URL`).
