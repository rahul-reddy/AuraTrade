# Deployment

## What is automated

Every push to `main` that passes CI publishes one image:

    ghcr.io/rahul-reddy/auratrade-web:<full commit SHA>

Images are tagged with the full SHA only, never `latest`, so a deployment always names
an exact, CI-verified revision. The image is the Next.js standalone server
(`node server.js`, port 3000, non-root user). It is private, like the repository.

Nothing deploys automatically.

## What a deployment needs

No hosting target has been chosen yet. Any host that runs a container works. It needs:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 16 connection string (`?sslmode=require` for a managed database). |
| `AUTH_SECRET` | NextAuth signing secret: `openssl rand -base64 32`. Never reuse the dev value. |
| `AUTH_URL` | Public base URL, e.g. `https://auratrade.example.com`. |
| `AUTH_TRUST_HOST` | `true` when behind a proxy or load balancer that sets the host header. |

The image does not run migrations. Before starting a new revision, apply migrations from
a clean checkout of the same commit:

    git checkout <sha>
    npm ci
    DATABASE_URL=<production url> npx prisma migrate deploy

Back up the database first. `prisma migrate deploy` only applies committed migrations;
never run `prisma migrate dev` or `prisma migrate reset` against a real database.

## Deploy steps (manual)

1. Confirm CI and the "Deliver container" workflow both succeeded for the commit.
2. Back up the production database.
3. Apply migrations as above.
4. Point the host at `ghcr.io/rahul-reddy/auratrade-web:<sha>` (the host needs a GitHub
   token with `read:packages` to pull a private image) and restart.
5. Smoke check: `/login` returns 200 and signed-out `/dashboard` redirects to `/login`.

When a host is chosen, add a script under `scripts/` that builds from a clean committed
revision, requires an explicit typed confirmation and takes any spending limit as a
parameter, per the workflow rules in AGENTS.md.

## Data warning

Production holds real brokerage history. Statements uploaded to the app are stored in
the database (raw rows included). Use a managed database with encryption at rest and
automated backups, keep the repository and image private, and never copy production
data into fixtures or logs.
