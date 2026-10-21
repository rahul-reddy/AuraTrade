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
  memory and clears on a restart. It tracks up to 10,000 addresses and never evicts a
  live record (an active lock, or failures still inside their 15-minute window); while
  all 10,000 slots are live (a spray), every untracked address is refused too until
  records expire. Someone who knows the owner's email, or sprays, can
  keep the owner locked out; if that happens, restart the web container
  (`~/auratrade/bin/dc restart web`).

## The server's `.env`

`~/auratrade/.env`, mode 600, owned by `ubuntu`. Three required keys plus an optional Finviz daily-export token:

```
AURATRADE_SITE_HOST=auratrades.quest
POSTGRES_PASSWORD=...   # openssl rand -hex 24
AUTH_SECRET=...         # openssl rand -base64 32; never the dev value
AURATRADE_FINVIZ_TOKEN=... # optional; server-only, never sent to browsers
```

Changing `AUTH_SECRET` signs everyone out. Changing `POSTGRES_PASSWORD` after the
database exists does **not** change the database's password; use `ALTER USER` first.

## Deploying

**Automatic production deployment is owner-authorized (2026-10-20).** Every
successful main push CI triggers `Deliver container`. The job builds both Linux
images on GitHub's runner, publishes the web image, then transfers the exact Git
source and checksummed images over SSH. It verifies exact-SHA CI and image
identity/platform/revision, backs up before migrating, waits for healthy services
and checks HTTPS login/closed registration through loopback Caddy before atomically
updating CURRENT. The GitHub runner separately probes the public login endpoint.
No new confirmation is required after each reviewed merge.

Deployments serialize through a GitHub concurrency group (in-progress deploys
are not cancelled) and a server lock. Superseded main commits are skipped before
building and again before deployment. Only successful same-repository main-push
CI events can deploy; PR, fork and manual CI-dispatch events cannot. A rerun of a
successful current-main push CI can retry delivery. Failed CI leaves production
unchanged. Check the `Deliver container` run for deployment outcome, not just CI.

The dedicated `AURATRADE_DEPLOY_KEY` repository secret has an independent,
revocable server authorized key with forwarding/PTY restrictions. The pinned
server host key is `AURATRADE_DEPLOY_KNOWN_HOSTS`; neither value is printed or
stored in Git. No GitHub credentials are stored on the server. Broker/database
secrets remain in its private runtime `.env`, never build arguments or image ENV.

Backup or migration failures stop before changing the application. If app startup
or loopback proxy checks fail, the server attempts to restore the previous application;
database migrations are retained, never reversed automatically. A failed rollback
requires operator intervention. External probe failures mark the workflow failed
for investigation. Destructive migrations still require an explicit
owner decision and backup under AGENTS.md. The workflow makes no cloud resource
or pricing changes. Builds stay off the 2 GB host.

### Manual recovery / workstation fallback

Only merged, CI-green revisions of `main` deploy. To retry current main, rerun its
successful push CI run; that triggers delivery again and rechecks current main.
For an owner-confirmed manual rollback or recovery, use the off-host procedure
below with the selected revision and its reviewed source/CI evidence.

`scripts/deploy.ps1` is a legacy workstation command that requests an on-host
build. It cannot complete against the default server configuration and must not
be used on this 2 GB instance: a previous TypeScript build caused memory pressure
and a transient 502. The server rejects on-host builds unless explicitly opted
in through `AURATRADE_ALLOW_HOST_BUILD=1` in the executing process. Routine
delivery uses the prebuilt mode and requires no workstation deployment command.

### Off-host images for the current instance

Keep the same release gates: clean worktree, exact revision merged to `main`,
successful `Verify AuraTrade` on that revision, independent PR approval and the
reviewed file tree. Build from `git archive <sha>` extracted into a fresh directory,
never the live workstation tree or its environment files. On a Linux/amd64-capable
Docker builder, build the repository Dockerfile twice: target `migrate` tagged
`auratrade-migrate:<sha>`, then the default target tagged `auratrade-web:<sha>`.
Use `--platform linux/amd64` and label each with
`org.opencontainers.image.revision=<sha>`. Both builds must pass, including the
Dockerfile's Prisma generation and Next.js typecheck/build. Keep credentials out
of build args and image environment; they are supplied by the server at runtime.

Export both images with `docker save`, transfer the archive and the exact Git
release over SSH, verify the archive SHA-256, then `docker load`. Compute each
portable identity with `docker image inspect <tag> | python3 deploy/image-identity.py <sha>`.
This hashes the uncompressed filesystem layer digests and normalized runtime
configuration (environment, commands, user, working directory, labels, ports,
volumes, stop signal and health check). Docker/containerd engine `.Id` values can
change on archive import, so they are not compared across hosts. Archive checksums
still verify the exact transferred bytes. Platform/revision and the image ENV
allowlist remain mandatory. Labels alone do not establish provenance.
The server directly supports:
`sh deploy/server-deploy.sh <sha> <web-content-identity> <migrate-content-identity> <site-host>`.
It checks those preloaded images and never builds in this mode. Preserve the
pre-migration backup, migration, service health waits, CURRENT update and cleanup.
Do not call the default workstation deployer afterward: it would rebuild on-host.
Run the usual public/authenticated smoke checks and a fresh backup/restore check.
When recovering to a release predating portable identities, invoke the current
reviewed server script and its sibling identity helper with the older target SHA;
the target's own legacy script would request a host build.
This changes neither AWS resources nor the fixed hosting bill. The recovery for
`57e7c92` used this procedure; its worktree-only helper and identity checks remain
under ignored `.local/` for audit, not as a supported public deployment command.

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
rest; the dumps live on that disk. Treat repository content as public, never copy server
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
5. **First deploy** with `scripts/deploy.ps1` (`d5b9043`, 2026-10-17). Caddy fetches the
   certificate once DNS resolves; it retries on its own, and `~/auratrade/bin/dc restart
   caddy` retries at once.
6. **Daily dump** (installed 2026-10-17): the server's crontab runs
   `30 8 * * * $HOME/auratrade/bin/backup.sh daily >> $HOME/auratrade/backups/cron.log 2>&1`.
7. **Owner account** with `set-user.mjs`, or the workstation database restored with
   `pg_restore` (stop `web` first).

## AWS access

Deploys never use AWS: `scripts/deploy.ps1` works over SSH only. An AWS key is needed
only to run the server itself (stop/start, firewall ports, snapshots, the static IP)
and to read costs.

| User | Key lives in | Policy | Can do |
| --- | --- | --- | --- |
| `AuraTrade` | workstation AWS CLI profile `auratrade` (`~/.aws/credentials`), never a repository `.env` | `infra/aws/auratrade-operations.json` (inline `auratrade-operations`) | Read the Lightsail inventory. Operate only resources tagged `project=auratrade`: start/stop/reboot, firewall ports, static IP attach/detach, browser SSH. Read costs; view and edit only the `AuraTrade monthly` budget. Rotate its own keys. |

- **Why a separate user:** AuraTrade was provisioned on 2026-10-17 with TenFold's
  `TenFold` user, whose `lightsail:*` covers every Lightsail resource in the account.
  A separate user limits what a leaked key can reach, puts AuraTrade's actions under its
  own name in CloudTrail, and gives it its own budget.
- **Tags are the boundary, and only an admin changes them.** `auratrade-1`,
  `auratrade-ip` and the `auratrade` key pair carry `project=auratrade`. Neither user may
  tag or untag: removing or overwriting `project` would move a resource out of this
  user's reach and out of TenFold's deny, back under TenFold's `lightsail:*`.
- **Reads are listed one by one, never `lightsail:Get*`.** That wildcard includes
  `GetBucketAccessKeys` (bucket secrets, account-wide only) and
  `GetInstanceAccessDetails` (temporary SSH access to any instance). The latter is
  granted only on tagged instances.
- **Admin-only (console), for two different reasons** (per the AWS Service
  Authorization Reference):
  - *Account-wide only* (`Resource: "*"`), so granting them would also reach TenFold:
    creating a server, allocating a static IP, importing a key pair, enabling or
    disabling automatic snapshots, deleting automatic snapshots.
  - *Could be tag-scoped, but are destructive or create spend*, so they stay with an
    admin by choice: deleting the server, releasing the static IP, deleting a key pair,
    restoring a server from a snapshot.
- **Manual snapshots are admin-only too.** A snapshot made from the CLI does not inherit
  the instance's tags, so one made without `--tags` would sit outside both boundaries:
  this user could not tag or delete it, and TenFold's deny would not cover it. Letting
  this user tag new snapshots on creation would let it tag TenFold's snapshots as its
  own. Daily automatic snapshots and the database dumps cover backups; an admin who
  makes a manual snapshot passes `--tags key=project,value=auratrade`.
- **The other direction:** `infra/aws/tenfold-deny-auratrade.json` is an inline policy
  for the `TenFold` user that denies every Lightsail action on `project=auratrade`
  resources. It cannot cover the account-wide actions above: with it, a TenFold key
  could still turn off or delete AuraTrade's automatic snapshots. Denying those would
  block TenFold's own.

### Creating the user (owner, AWS console, signed in as an admin)

1. **IAM → Users → Create user.** Name `AuraTrade`. Leave console access off. On
   "Set permissions", choose nothing and create the user.
2. **The user → Permissions → Add permissions → Create inline policy → JSON.** Paste
   `infra/aws/auratrade-operations.json` whole. Name it `auratrade-operations`.
3. **The user → Security credentials → Create access key → Command Line Interface.**
   On the workstation, run `aws configure --profile auratrade` and paste the key there,
   region `us-east-2`. Never put it in a chat, a commit or this repository's `.env`
   (Next.js and Prisma load that file).
4. **Billing → Budgets → Create budget → Cost budget, monthly.** Name it exactly
   `AuraTrade monthly` (the policy names it). Optionally activate the `project` tag
   under Billing → Cost allocation tags first (it takes up to 24 hours), then filter
   the budget to `project=auratrade`.
5. **Optional, the other direction:** IAM → Users → `TenFold` → Add permissions →
   Create inline policy → JSON → paste `infra/aws/tenfold-deny-auratrade.json`, name
   `deny-auratrade`. TenFold's inline policies then total about 1,400 of 2,048 bytes.

Then check it live: `sh infra/aws/check-auratrade-access.sh` (AWS CLI profile
`auratrade`). The IAM policy simulator is not available to these users, so the script
probes live, with exact commands chosen so that none changes anything even if the policy
were wrongly broader. It first confirms the no-op preconditions and aborts if any is
missing: 22/tcp already open to `0.0.0.0/0` and automatic snapshots already on at 09:00
on both servers, and `auratrade-1` already tagged `project=auratrade`. It then expects:

| Probe | Expected |
| --- | --- |
| `get-instances` | allowed |
| `get-instance-access-details` on `auratrade-1` / `tenfold-1` | allowed / denied |
| `open-instance-public-ports` 22/tcp `0.0.0.0/0` on `auratrade-1` / `tenfold-1` | allowed / denied |
| `enable-add-on` AutoSnapshot 09:00 on `auratrade-1` | denied |
| `tag-resource` `project=auratrade` on `auratrade-1` (its current value) | denied |
| `get-bucket-access-keys` on a bucket name that does not exist | denied |
| `iam get-user` on `TenFold` / `AuraTrade` (read-only) | denied / allowed |

**Verified live 2026-10-17:** the owner created `AuraTrade` (inline `auratrade-operations`),
profile `auratrade`, and the `AuraTrade monthly` budget ($20, monthly). The script ran as
`arn:aws:iam::<account-id>:user/AuraTrade`: all 10 probes matched, and afterwards both
servers' ports and automatic snapshots were unchanged. The budget has no cost filter yet,
so it tracks the whole account (both servers, ≈ $26–28) until it is filtered to
`project=auratrade`. The optional TenFold deny (`deny-auratrade`) is not attached.

## Operational health

`/settings/health` is authenticated and shows import alerts for the selected owned
account, daily-cache retrieval age for its symbols, and host backup/restore
evidence. Retrieval age is not a live-price guarantee. Failed uploads in the last
7 days and processing jobs older than 30 minutes are flagged. Alerts are in-app;
external notifications have not been configured.

Deploy copies `backup.sh`, `restore-check.sh` and `health-status.py` to the stable
`~/auratrade/bin/` directory. Health records contain only state and timestamps in
`~/auratrade/health/status.json`; the web container mounts that directory read-only.
The existing daily backup schedule is retained. Deployment manages one additional
cron line, `# auratrade-restore-check`, at 03:45 Sunday in the server's timezone.
The job uses `flock` to prevent concurrent restore checks. Server prerequisites:
Python 3, `flock`, `crontab` and Docker (present on the hosted Ubuntu server).

Run a verification manually after deployment:

```sh
~/auratrade/bin/restore-check.sh
cat ~/auratrade/health/status.json
```

The script selects the newest finalized dump, creates a database named
`auratrade_restore_check_<UTC timestamp>_<pid>`, restores with `--exit-on-error`,
queries the migration/trades/users tables, and drops only the database it
successfully created. A failed creation never triggers a drop. The live database
is never a restore target. A restore or cleanup failure records failed evidence.
This validates restorability and queryability, not every business invariant or
off-host disaster recovery. Restore checks use server disk/CPU temporarily.

Backup failures now exit nonzero, including a stopped database, and remove partial
dumps. Atomic, locked evidence updates preserve the last success across failures.
No evidence or corrupt JSON is unknown, never healthy. A backup older than 36 hours
or restore verification older than 10 days needs attention. Inspect
`~/auratrade/restore-check.log` and the existing backup job log when a job fails.
Dump/restore diagnostics are replaced with generic failure messages: PostgreSQL
COPY errors can include raw row values, which must not reach operational logs.

## Container image on GHCR (delivery)

Every push to `main` that passes CI publishes
`ghcr.io/rahul-reddy/auratrade-web:<full sha>` (`.github/workflows/delivery.yml`). The
server receives the same built web image plus its migration image over pinned
SSH. It does not pull from GHCR or hold a registry token. The runner builds once;
the production server only loads and verifies the resulting artifacts.

## Schwab runtime secrets

Set `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET` and `SCHWAB_TOKEN_KEY` in the private
host `~/auratrade/.env` (mode 0600), without putting values in commands, logs or
git. The key is 32 random bytes encoded as 64 hex characters; preserve it across
releases and keep a secure off-host copy alongside other deployment secrets.
The compose web service receives these only at runtime, enables the persistent
daily sync worker and uses the HTTPS callback at
`/api/brokers/schwab/callback` on the configured site host. No extra public ports,
cron bearer tokens or orders endpoint are needed. Do not rotate the encryption
key without re-encrypting stored broker values or disconnecting all connections.
After deployment the owner must complete Schwab's interactive authorization in
Settings → Connections and review the first batch. Verify the app is active and
the registered callback matches exactly if authorization fails. Automatic sync
failures pause the connection and show an in-app message; no private upstream
payloads or raw exceptions are logged. Imported trades remain available while
reconnection is required. Database restore checks do not prove that Schwab
authorization remains valid; restored broker tokens may require reconnection.
