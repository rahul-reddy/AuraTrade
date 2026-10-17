#!/bin/sh
# Dump the AuraTrade database to ~/auratrade/backups (mode 700, files 600).
# Usage: backup.sh <label>
#   daily      run by cron; the newest 14 daily dumps are kept
#   pre-<sha>  run by server-deploy.sh before migrating; the newest 10 are kept
# The server disk is encrypted at rest and covered by the daily Lightsail
# snapshot, so these dumps are also inside that snapshot.
set -eu
label=${1:?usage: backup.sh <label>}
dir="$HOME/auratrade/backups"
umask 077
mkdir -p "$dir"

if ! docker inspect -f '{{.State.Running}}' auratrade-db-1 2>/dev/null | grep -q true; then
    echo "Database container is not running; nothing to back up." >&2
    exit 0
fi

out="$dir/auratrade-$(date -u +%Y%m%dT%H%M%SZ)-$label.dump"
docker exec auratrade-db-1 pg_dump -U auratrade -Fc auratrade > "$out.partial"
mv "$out.partial" "$out"
echo "Backup written: $out ($(du -h "$out" | cut -f1))"

case "$label" in
    daily) keep=14; pattern='*-daily.dump' ;;
    *) keep=10; pattern='*-pre-*.dump' ;;
esac
# shellcheck disable=SC2086
ls -1t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -f
