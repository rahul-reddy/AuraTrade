#!/bin/sh
# Runs ON the AuraTrade server. Started by scripts/deploy.ps1 on the workstation,
# which has already checked the revision (committed, on main, CI green), had the
# owner type the confirmation, and unpacked `git archive <sha>` into
#   ~/auratrade/releases/<sha>
# Usage: sh ~/auratrade/releases/<sha>/deploy/server-deploy.sh <sha>
#
# Order matters: build first (the old version keeps serving), back up, migrate,
# then swap the web container. A failed build or migration stops before the
# swap. Migrations are never reversed automatically; see docs/DEPLOYMENT.md.
set -eu

sha=${1:?usage: server-deploy.sh <full commit sha>}
case "$sha" in
    *[!0-9a-f]* | "") echo "Not a commit sha: $sha" >&2; exit 2 ;;
esac
[ ${#sha} -eq 40 ] || { echo "Need the full 40-character sha." >&2; exit 2; }

root="$HOME/auratrade"
release="$root/releases/$sha"
envfile="$root/.env"
[ -f "$release/deploy/compose.yaml" ] || { echo "Missing release $release" >&2; exit 1; }
[ -f "$envfile" ] || { echo "Missing $envfile" >&2; exit 1; }

export AURATRADE_REVISION="$sha"
dc() {
    docker compose --project-directory "$release/deploy" -f "$release/deploy/compose.yaml" \
        --env-file "$envfile" "$@"
}

echo "== Building $sha"
dc --profile tools build web migrate

echo "== Starting the database"
dc up -d --wait db

# The scripts cron and the owner run live at stable paths, refreshed per deploy.
mkdir -p "$root/bin"
mkdir -p "$root/health"
chmod 755 "$root/health"
cp "$release/deploy/backup.sh" "$root/bin/backup.sh"
cp "$release/deploy/dc.sh" "$root/bin/dc"
cp "$release/deploy/health-status.py" "$root/bin/health-status.py"
cp "$release/deploy/restore-check.sh" "$root/bin/restore-check.sh"
chmod 700 "$root/bin/backup.sh" "$root/bin/dc" "$root/bin/health-status.py" "$root/bin/restore-check.sh"

echo "== Backing up before migrating"
"$root/bin/backup.sh" "pre-${sha%"${sha#???????}"}"

echo "== Applying migrations"
dc --profile tools run --rm migrate

echo "== Starting $sha"
dc up -d --wait --remove-orphans web caddy
printf '%s\n' "$sha" > "$root/CURRENT"
# Preserve existing jobs, replacing only AuraTrade's managed restore-check line.
(crontab -l 2>/dev/null | grep -v '# auratrade-restore-check' || true; printf '45 3 * * 0 %s/bin/restore-check.sh >> %s/restore-check.log 2>&1 # auratrade-restore-check\n' "$root" "$root") | crontab -

# Keep the newest three releases (rollback targets) and their images.
ls -1t "$root/releases" | tail -n +4 | while read -r old; do
    rm -rf "$root/releases/$old"
    docker image rm "auratrade-web:$old" "auratrade-migrate:$old" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null

echo "== Deployed $sha"
