#!/bin/sh
# `docker compose` for the deployed AuraTrade release, installed by
# server-deploy.sh as ~/auratrade/bin/dc. Pins the images to the current
# revision so one-off commands never rebuild. Example:
#   ~/auratrade/bin/dc ps
#   ~/auratrade/bin/dc --profile tools run --rm -T migrate node deploy/set-user.mjs --email ...
set -eu
root="$HOME/auratrade"
AURATRADE_REVISION=$(cat "$root/CURRENT")
export AURATRADE_REVISION
release="$root/releases/$AURATRADE_REVISION"
exec docker compose --project-directory "$release/deploy" -f "$release/deploy/compose.yaml" \
    --env-file "$root/.env" "$@"
