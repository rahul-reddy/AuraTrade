#!/usr/bin/env bash
# GitHub runner only: checked-out, CI-green main -> verified off-host images -> SSH.
# Owner-authorized automatic production deployments (2026-10-20).
set -euo pipefail
sha=${1:?revision required}
host=${2:?SSH host required}
site=${3:?site hostname required}
key=${4:?SSH key file required}
known_hosts=${5:?pinned known_hosts file required}
[[ $sha =~ ^[0-9a-f]{40}$ && $host =~ ^[a-zA-Z0-9.-]+$ && $site =~ ^[a-zA-Z0-9.-]+$ ]] || exit 2
[[ ${GITHUB_RUN_ID:-} =~ ^[0-9]+$ && ${GITHUB_RUN_ATTEMPT:-} =~ ^[0-9]+$ ]] || exit 2
[[ ${GITHUB_REPOSITORY:-} == rahul-reddy/AuraTrade ]] || exit 2
[[ $(git rev-parse HEAD) == "$sha" ]] || { echo 'Checkout does not match release.' >&2; exit 1; }
git merge-base --is-ancestor "$sha" origin/main
checks=$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/check-runs" --jq '[.check_runs[] | select(.name == "Verify AuraTrade" and .conclusion == "success")] | length')
[[ $checks =~ ^[1-9][0-9]*$ ]] || { echo 'Exact release CI is not green.' >&2; exit 1; }
latest=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)
[[ $latest =~ ^[0-9a-f]{40}$ ]] || { echo 'Could not verify current main.' >&2; exit 1; }
if [[ $latest != "$sha" ]]; then echo 'Skipping superseded release.'; exit 0; fi
work=$(mktemp -d)
remote_created=0
cleanup() {
    rm -rf "$work"
    if [[ $remote_created == 1 ]]; then
        ssh "${ssh_args[@]}" "$target" "rm -rf \"\$HOME/$incoming\"" || echo 'Could not clean remote incoming artifacts.' >&2
    fi
}
trap cleanup EXIT
for kind in web migrate; do
    docker image inspect "auratrade-$kind:$sha" > "$work/$kind.json"
    # The shared validator never dumps image environment or other private metadata.
    python3 deploy/image-identity.py "$sha" < "$work/$kind.json" > "$work/$kind.id"
done
web_id=$(cat "$work/web.id"); migrate_id=$(cat "$work/migrate.id")
git archive --format=tar --output="$work/source.tar" "$sha"
docker save "auratrade-web:$sha" "auratrade-migrate:$sha" | gzip -1 > "$work/images.tar.gz"
(cd "$work" && sha256sum source.tar images.tar.gz > checksums)
ssh_args=(-i "$key" -o "UserKnownHostsFile=$known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=20)
target="ubuntu@$host"
incoming="auratrade/incoming/$sha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
remote_created=1
ssh "${ssh_args[@]}" "$target" "umask 077; mkdir -p \"\$HOME/$incoming\""
scp "${ssh_args[@]}" -q "$work/source.tar" "$work/images.tar.gz" "$work/checksums" "$target:$incoming/"
# A slow build/upload must not deploy an old commit over newer main.
latest=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)
[[ $latest =~ ^[0-9a-f]{40}$ ]] || { echo 'Could not verify current main.' >&2; exit 1; }
if [[ $latest != "$sha" ]]; then
    echo 'Skipping release superseded during artifact transfer.'; exit 0
fi
# Artifacts and checksums travel over authenticated, host-pinned SSH. Source is
# from git archive, never the runner worktree or environment.
ssh "${ssh_args[@]}" "$target" "bash -se" <<REMOTE
set -euo pipefail
cd "\$HOME/$incoming"
sha256sum -c checksums
docker load --input images.tar.gz
release="\$HOME/auratrade/releases/$sha"
mkdir -p "\$release"
tar -xf source.tar -C "\$release"
sh "\$release/deploy/server-deploy.sh" '$sha' '$web_id' '$migrate_id' '$site'
rm -rf "\$HOME/$incoming"
REMOTE
remote_created=0
[[ $(curl --silent --show-error --retry 3 --retry-delay 2 --retry-all-errors --max-time 30 --output /dev/null --write-out '%{http_code}' "https://$site/login") == 200 ]]
echo "Deployed $sha to https://$site"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    printf 'Deployed `%s` to https://%s after verified images, backup, migrations and public health checks.\n' "$sha" "$site" >> "$GITHUB_STEP_SUMMARY"
fi
