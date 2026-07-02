# Local Tensara Hosting

This fork hosts the Tensara web app and database on the current machine. Vast is used only as a private GPU runner when the app needs checker, benchmark, sample, or sandbox execution.

Current deployment:

```text
https://tensara.62.171.174.233.sslip.io
```

The Vast runner at `192.3.91.246` is not the public Tensara site. It runs `engine/local_api.py` on `127.0.0.1:18000`, and this host reaches it through a local SSH tunnel:

```text
127.0.0.1:18000 -> root@192.3.91.246:127.0.0.1:18000
```

## Environment

Start from `.env.example` and update secrets:

```bash
cp .env.example .env
```

Current RTX 5090 defaults:

```env
NEXT_PUBLIC_BASE_URL="https://tensara.62.171.174.233.sslip.io"
NEXTAUTH_URL="https://tensara.62.171.174.233.sslip.io"

NEXT_PUBLIC_TENSARA_GPU_TYPE="RTX5090"
NEXT_PUBLIC_TENSARA_GPU_DISPLAY_NAME="NVIDIA GeForce RTX 5090"
NEXT_PUBLIC_TENSARA_GPU_COMPUTE_CAPABILITY="12.0"

MODAL_ENDPOINT="http://127.0.0.1:18000"
LOCAL_ENGINE_TOKEN="<same token as Vast engine>"
```

For another GPU, change both public `NEXT_PUBLIC_TENSARA_GPU_*` values and engine `LOCAL_GPU_*` values. Compute capability accepts forms like `12.0`, `120`, or `sm_120`.

## Services

The local host runs:

- `postgresql.service` for app state.
- `tensara-vast-tunnel.service` for the SSH tunnel to Vast.
- `tensara-web.service` for `next start` on `127.0.0.1:18080`.
- `caddy.service` for HTTPS at the `.sslip.io` URL.

The Vast host runs only:

- `tensara_engine` under supervisor.

The mistaken Vast web/database services should stay stopped and disabled:

```bash
ssh -i ~/.ssh/tensara_vast_ed25519 -p 25555 -o IdentitiesOnly=yes root@192.3.91.246 \
  'supervisorctl status tensara_engine tensara_web tensara_postgres'
```

Expected state is `tensara_engine RUNNING`, `tensara_web STOPPED`, and `tensara_postgres STOPPED`.

## Run Locally

For a development run with a local engine:

```bash
pnpm install
./start-database.sh
pnpm db:push
pnpm seed:local-user
pnpm engine:local
```

In a second shell:

```bash
PORT=8080 pnpm dev:local
```

For this production-style split, run the web service locally and tunnel to Vast:

```bash
ssh -i ~/.ssh/tensara_vast_ed25519 -p 25555 -o IdentitiesOnly=yes \
  -N -L 127.0.0.1:18000:127.0.0.1:18000 root@192.3.91.246

pnpm build
pnpm start --hostname 127.0.0.1 --port 18080
```

Systemd templates are checked in under `infra/systemd/`.

## Caddy

Caddy terminates HTTPS and proxies public traffic to the local Next.js server. The site is intentionally public to view, while `robots.txt`, no-index headers, and no-index meta tags tell search engines not to index it.

The checked-in template is `infra/Caddyfile.local-tensara`.

## Search Indexing

This local deployment is intentionally non-indexable:

- `robots.txt` disallows all crawlers.
- Caddy, `src/middleware.ts`, and `next.config.js` set `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`.
- `src/pages/_document.tsx` adds matching `robots` and `googlebot` meta tags.

## Verification

```bash
systemctl is-active postgresql tensara-vast-tunnel tensara-web caddy
curl -sS http://127.0.0.1:18000/health
curl -I https://tensara.62.171.174.233.sslip.io/
curl https://tensara.62.171.174.233.sslip.io/robots.txt
```
