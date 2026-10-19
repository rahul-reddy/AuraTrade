#!/bin/sh
# Dump the AuraTrade database to ~/auratrade/backups (mode 700, files 600).
# Usage: backup.sh <label>
#   daily      run by cron; the newest 14 daily dumps are kept
#   pre-<sha>  run by server-deploy.sh before migrating; the newest 10 are kept
# The server disk is encrypted at rest and covered by the daily Lightsail
# snapshot, so these dumps are also inside that snapshot.
set -eu
label=${1:?usage: backup.sh <label>}
case "$label" in
    daily | pre-*) ;;
    *) echo "Unsupported backup label." >&2; exit 2 ;;
esac
case "$label" in *[!a-z0-9-]*) echo "Invalid backup label." >&2; exit 2 ;; esac
dir="$HOME/auratrade/backups"
umask 077
mkdir -p "$dir"
health="$HOME/auratrade/bin/health-status.py"
out=""
failed() {
    code=$?
    if [ "$code" -ne 0 ]; then
        [ -z "$out" ] || rm -f "$out.partial"
        python3 "$health" backup failed || echo "Could not record backup health." >&2
    fi
}
trap failed EXIT
python3 "$health" backup running

if ! docker inspect -f '{{.State.Running}}' auratrade-db-1 2>/dev/null | grep -q true; then
    echo "Database container is not running; backup failed." >&2
    exit 1
fi

out="$dir/auratrade-$(date -u +%Y%m%dT%H%M%SZ)-$label.dump"
if ! docker exec auratrade-db-1 pg_dump -U auratrade -Fc auratrade > "$out.partial" 2>/dev/null; then
    echo "Database dump failed; private database diagnostics are not logged." >&2
    exit 1
fi
mv "$out.partial" "$out"
python3 "$health" backup success
echo "Backup written: $out ($(du -h "$out" | cut -f1))"

case "$label" in
    daily) keep=14; pattern='*-daily.dump' ;;
    *) keep=10; pattern='*-pre-*.dump' ;;
esac
# shellcheck disable=SC2086
ls -1t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -f
