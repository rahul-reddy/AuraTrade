# Deployment

AuraTrade runs on one AWS Lightsail server in Ohio (`us-east-2`), set up the same way
as TenFold's (owner decision, 2026-10-17: "Option A", its own server). It is fully
separate from TenFold: its own instance, static IP, SSH key and database.

| Piece | Where |
| --- | --- |
| Web server (Next.js standalone), PostgreSQL 16 | Docker on `auratrade-1` (`deploy/compose.yaml`) |
| HTTPS certificate (Let's Encrypt) | Caddy on `auratrade-1` (`deploy/caddy/Caddyfile`) |
| Address | `https://auratrades.quest` (Namecheap; `A @ → 18.226.191.214`) |
| Database dumps | `~/auratrade/backups`: before every deploy (10 kept) and daily 08:30 UTC (14 kept) |
| Server snapshots | Lightsail automatic snapshots, daily 09:00 UTC, 7 kept |
| Sign-in | The app's own accounts; public sign-up is **off** on the server |

## Cost

Lightsail `small_3_0`: 2 vCPU, 2 GB memory, 60 GB SSD, 3 TB transfer, IPv4 included,
**$12.00/month** (live `get-bundles` price, 2026-10-17), plus snapshots at about
$0.05/GB-month (~$1–3). The 1 GB `micro_3_0` ($7) was not used: the image is built on
the server, and a Next.js build next to a running Postgres needs the 2 GB plus swap.

The account-wide AWS budget "My Monthly Cost Budget" is $20. TenFold and AuraTrade
together are about $26–28 a month, so that alert will fire until the owner raises it
(the `TenFold` IAM user, which runs Lightsail, cannot edit that budget).

## What the internet can reach

- Lightsail firewall: ports 22 (SSH, key only), 80 and 443. Nothing else.
- Only Caddy publishes ports. The web server (port 3000) and Postgres exist only on
  the compose network. Port 80 redirects to HTTPS. HSTS, `nosniff`,
  `X-Frame-Options: DENY` and a 50 MB request-body cap are set in the Caddyfile.
- **Sign-up is closed**: `deploy/compose.yaml` sets `AURATRADE_REGISTRATION=closed` on
  the web service itself, so the server's `.env` cannot reopen it. `/register` shows
  "Sign-up is closed" and `POST /api/auth/register` answers 403. Any value other than
  `open` (or unset) counts as closed (`src/lib/registration.ts`).
- **Failed sign-ins**: five wrong passwords for one email within 15 minutes lock that
  email for 15 minutes, during which even the right password is refused with the same
  "Invalid email or password." message (`src/lib/login-throttle.ts`). The lock is in
  memory and clears on a restart. Someone who knows the owner's email can keep the
  owner locked out by guessing; if that happens, restart the web container.

## The server's `.env`

`~/auratrade/.env`, mode 600, owned by `ubuntu`. Exactly three keys:

```
AURATRADE_SITE_HOST=auratrades.quest
POSTGRES_PASSWORD=...   # openssl rand -hex 24
AUTH_SECRET=...         # openssl rand -base64 32; never the dev value
```

Changing `AUTH_SECRET` signs everyone out. Changing `POSTGRES_PASSWORD` after the
database exists does **not** change the database's password; use `ALTER USER` first.

## Deploying

Only merged, CI-green revisions of `main` deploy. From the workstation, in the
repository root, with a clean worktree:

```
pwsh -NoProfile -File scripts/deploy.ps1 -Confirm "DEPLOY <first 7 of the sha>"
```

`-Revision` defaults to `origin/main`; the script prints the exact confirmation it
wants if `-Confirm` does not match. It:

1. refuses an uncommitted worktree, a revision not on `origin/main`, or one without a
   successful `Verify AuraTrade` check;
2. copies `git archive <sha>` to `~/auratrade/releases/<sha>` over SSH. The server holds
   no GitHub credential and never pulls;
3. runs `deploy/server-deploy.sh <sha>` there: build the `web` and `migrate` images
   (the running version keeps serving), dump the database, `prisma migrate deploy`,
   then replace the web container and wait for its health check. A failed build or
   migration stops before the swap. It keeps the newest 3 releases and their images;
4. smoke-checks `https://auratrades.quest`: `/login` 200, signed-out `/dashboard`
   redirects to `/login`, sign-up answers 403.

A deploy creates no AWS resources, so it takes no spending limit; the server's price is
fixed above. A build takes about 5–6 minutes.

Never run `prisma migrate dev` or `prisma migrate reset` against the server's database.

## Owner account

Created or reset on the server. The password is read from stdin, never the command
line, and must be at least 12 characters:

```
ssh -i ~/.ssh/auratrade-lightsail ubuntu@18.226.191.214
read -rs PW && printf '%s\n' "$PW" | ~/auratrade/bin/dc --profile tools \
  run --rm -T migrate node deploy/set-user.mjs --email you@example.com --name "Your Name"; unset PW
```

The same command on an existing email resets its password. `~/auratrade/bin/dc` is
`docker compose` pinned to the deployed release (`deploy/dc.sh`, installed by each deploy).

## Restore

- **A bad deploy:** deploy the previous sha: `scripts/deploy.ps1 -Revision <sha>`.
  Migrations are not reversed. If the bad revision ran a migration the old code cannot
  live with, restore its `pre-<sha>` dump instead (below).
- **Lost or damaged data:** stop the web container, then restore a dump:
  ```
  ~/auratrade/bin/dc stop web
  docker exec -i auratrade-db-1 pg_restore -U auratrade -d auratrade --clean --if-exists --no-owner \
    < ~/auratrade/backups/<file>.dump
  ~/auratrade/bin/dc start web
  ```
- **Lost server:** create an instance from the latest Lightsail snapshot, then move
  `auratrade-ip` to it.

## Data warning

The server holds real brokerage history: uploaded statements are stored in the
database, raw rows included. The Lightsail disk and its snapshots are encrypted at
rest; the dumps live on that disk. Keep the repository private, never copy server
data into fixtures or logs, and do not open more ports.

## Built from scratch (2026-10-17)

1. **Server**, with the `TenFold` IAM user's credentials (it holds `lightsail:*`),
   region `us-east-2`:
   ```
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/auratrade-lightsail
   aws lightsail import-key-pair --key-pair-name auratrade --public-key-base64 "$(cat ~/.ssh/auratrade-lightsail.pub)"
   aws lightsail create-instances --instance-names auratrade-1 --availability-zone us-east-2a \
     --blueprint-id ubuntu_24_04 --bundle-id small_3_0 --key-pair-name auratrade --tags key=project,value=auratrade
   aws lightsail allocate-static-ip --static-ip-name auratrade-ip
   aws lightsail attach-static-ip --static-ip-name auratrade-ip --instance-name auratrade-1
   aws lightsail put-instance-public-ports --instance-name auratrade-1 --port-infos \
     fromPort=22,toPort=22,protocol=tcp fromPort=80,toPort=80,protocol=tcp fromPort=443,toPort=443,protocol=tcp
   aws lightsail enable-add-on --resource-name auratrade-1 \
     --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=09:00}'
   ```
2. **Software:** TenFold's `infra/lightsail/setup-server.sh` (Docker, Compose, git,
   unattended-upgrades, 2 GB swap).
3. **`.env`:** written on the server as above.
4. **DNS (owner, Namecheap → Advanced DNS):** delete the parking records; add
   `A @ 18.226.191.214` and `CNAME www auratrades.quest.`.
5. **First deploy** with `scripts/deploy.ps1`; Caddy fetches the certificate once DNS
   resolves.
6. **Daily dump:** `crontab -e` on the server: `30 8 * * * $HOME/auratrade/bin/backup.sh daily`.
7. **Owner account** with `set-user.mjs`, or the workstation database restored with
   `pg_restore` (stop `web` first).

## Container image on GHCR

Separately, every push to `main` that passes CI publishes
`ghcr.io/rahul-reddy/auratrade-web:<full sha>` (`.github/workflows/delivery.yml`). The
server does not use it (pulling a private image would need a GitHub token on the
server); it builds the same Dockerfile from the same commit instead.
