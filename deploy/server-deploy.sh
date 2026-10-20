#!/bin/sh
# Runs ON the AuraTrade server. Automatic delivery (scripts/deploy-prebuilt.sh)
# checks exact-main CI, transfers verified images, and unpacks git archive into
#   ~/auratrade/releases/<sha>
# Usage: sh <script> <sha> <web-image-id> <migrate-image-id> [site-host]
#
# Order matters: verify images (the old version keeps serving), back up, migrate,
# then swap the web container. A failed build or migration stops before the
# swap. Migrations are never reversed automatically; see docs/DEPLOYMENT.md.
set -eu

sha=${1:?usage: server-deploy.sh <full commit sha> [web image ID migrate image ID site host]}
case "$sha" in
    *[!0-9a-f]* | "") echo "Not a commit sha: $sha" >&2; exit 2 ;;
esac
[ ${#sha} -eq 40 ] || { echo "Need the full 40-character sha." >&2; exit 2; }

root="$HOME/auratrade"
mkdir -p "$root"
# Also serializes workstation deployments with GitHub Actions deployments.
exec 9>"$root/deploy.lock"
flock -x 9
release="$root/releases/$sha"
envfile="$root/.env"
[ -f "$release/deploy/compose.yaml" ] || { echo "Missing release $release" >&2; exit 1; }
[ -f "$envfile" ] || { echo "Missing $envfile" >&2; exit 1; }

export AURATRADE_REVISION="$sha"
dc() {
    docker compose --project-directory "$release/deploy" -f "$release/deploy/compose.yaml" \
        --env-file "$envfile" "$@"
}

site_host=${4:-auratrades.quest}
case "$site_host" in *[!a-zA-Z0-9.-]* | "") echo 'Invalid site host.' >&2; exit 2 ;; esac
if [ "$#" -eq 1 ]; then
    [ "${AURATRADE_ALLOW_HOST_BUILD:-0}" = 1 ] || { echo 'Off-host images required. On-host build is disabled on the 2 GB production server.' >&2; exit 2; }
    echo "== Building $sha (manual legacy mode; unsuitable for the 2 GB host)"
    dc --profile tools build web migrate
elif [ "$#" -eq 3 ] || [ "$#" -eq 4 ]; then
    echo "== Verifying prebuilt images for $sha"
    for kind in web migrate; do
        if [ "$kind" = web ]; then expected=$2; else expected=$3; fi
        digest=${expected#sha256:}
        case "$digest" in *[!0-9a-f]* | "") echo 'Invalid image ID.' >&2; exit 2 ;; esac
        [ "$expected" = "sha256:$digest" ] && [ "${#digest}" -eq 64 ] || exit 2
        image="auratrade-$kind:$sha"
        [ "$(docker image inspect --format '{{.Id}}' "$image")" = "$expected" ] || { echo 'Image identity mismatch.' >&2; exit 1; }
        [ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$sha" ] || { echo 'Image revision mismatch.' >&2; exit 1; }
        [ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" = linux/amd64 ] || { echo 'Image platform mismatch.' >&2; exit 1; }
    done
else
    echo 'Supply both expected image IDs, or neither.' >&2; exit 2
fi

previous=""
if [ -f "$root/CURRENT" ]; then previous=$(cat "$root/CURRENT"); fi
case "$previous" in *[!0-9a-f]*) echo 'Invalid previous revision.' >&2; exit 1 ;; esac
[ -z "$previous" ] || [ "${#previous}" -eq 40 ] || exit 1
rollback_needed=0
failed() {
    code=$?
    trap - EXIT
    if [ "$code" -ne 0 ] && [ "$rollback_needed" = 1 ] && [ -n "$previous" ]; then
        echo 'Deployment failed; restoring the previous application (database migrations are retained).' >&2
        export AURATRADE_REVISION="$previous"
        docker compose --project-directory "$root/releases/$previous/deploy" -f "$root/releases/$previous/deploy/compose.yaml" --env-file "$envfile" up -d --wait --remove-orphans web caddy || echo 'Application rollback failed; operator intervention required.' >&2
    fi
    exit "$code"
}
trap failed EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
rollback_needed=1
dc up -d --wait --remove-orphans web caddy
# Allow the proxy to settle, but never publish CURRENT without both checks.
public_ready=0
for attempt in 1 2 3 4 5 6; do
    login=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "https://$site_host/login") || login=0
    registration=$(curl --silent --show-error --max-time 15 --request POST --output /dev/null --write-out '%{http_code}' "https://$site_host/api/auth/register") || registration=0
    if [ "$login" = 200 ] && [ "$registration" = 403 ]; then public_ready=1; break; fi
    sleep 2
done
[ "$public_ready" = 1 ] || { echo 'Public deployment health checks failed.' >&2; exit 1; }
printf '%s\n' "$sha" > "$root/CURRENT.next"
mv "$root/CURRENT.next" "$root/CURRENT"
rollback_needed=0
# Preserve existing jobs, replacing only AuraTrade's managed restore-check line.
(crontab -l 2>/dev/null | grep -v '# auratrade-restore-check' || true; printf '45 3 * * 0 %s/bin/restore-check.sh >> %s/restore-check.log 2>&1 # auratrade-restore-check\n' "$root" "$root") | crontab -

# Keep the newest three releases (rollback targets) and their images.
ls -1t "$root/releases" | tail -n +4 | while read -r old; do
    # Failed/staged releases must never cause cleanup of the active app or its
    # immediate rollback target, and arbitrary directory names are not deleted.
    case "$old" in *[!0-9a-f]* | "") continue ;; esac
    [ "${#old}" -eq 40 ] || continue
    [ "$old" != "$sha" ] && [ "$old" != "$previous" ] || continue
    rm -rf "$root/releases/$old"
    docker image rm "auratrade-web:$old" "auratrade-migrate:$old" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null

echo "== Deployed $sha"
