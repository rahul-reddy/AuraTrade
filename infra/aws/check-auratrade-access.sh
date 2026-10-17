#!/bin/sh
# Live check of the AuraTrade IAM user's boundary (docs/DEPLOYMENT.md -> AWS access).
# Run on the workstation after the owner creates the user:
#   sh infra/aws/check-auratrade-access.sh            (uses AWS CLI profile "auratrade")
#
# The IAM policy simulator is not available to these users, so this probes live.
# Each probe is chosen to change nothing even if the policy were wrongly broader:
#   - open-instance-public-ports 22/tcp from 0.0.0.0/0, which is already open on both
#     servers (checked first; the script aborts if it is not);
#   - enable-add-on AutoSnapshot at 09:00, which both servers already have (checked);
#   - tag-resource project=auratrade on auratrade-1, which already carries exactly that;
#   - get-bucket-access-keys on a bucket name that does not exist;
#   - iam get-user, read-only, on the TenFold user.
# Outcomes: "allowed" when the call succeeds, or fails with NotFound (authorization
# passed, the target did not exist); "denied" on an AccessDenied error; anything
# else (network, expired credentials, throttling, validation) is "inconclusive" and
# fails the run, so a broken call is never mistaken for working access.
set -eu
profile=${AWS_PROFILE_NAME:-auratrade}
export AWS_DEFAULT_REGION=us-east-2
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws_p() { aws --profile "$profile" "$@"; }

me=$(aws_p sts get-caller-identity --query Arn --output text)
case "$me" in
    arn:aws:iam::[0-9]*:user/AuraTrade) echo "Probing as $me" ;;
    *) echo "Profile '$profile' is $me, not the AuraTrade user; refusing." >&2; exit 2 ;;
esac

# Preconditions that make the write probes no-ops.
for i in auratrade-1 tenfold-1; do
    ssh_open=$(aws_p lightsail get-instance-port-states --instance-name "$i" \
        --query "portStates[?fromPort==\`22\` && toPort==\`22\` && protocol=='tcp' && contains(cidrs, '0.0.0.0/0')] | length(@)" --output text)
    [ "$ssh_open" = 1 ] || { echo "$i: 22/tcp is not open to 0.0.0.0/0; the port probe would change it. Aborting." >&2; exit 2; }
    snap=$(aws_p lightsail get-instance --instance-name "$i" \
        --query "instance.addOns[?name=='AutoSnapshot' && status=='Enabled'].snapshotTimeOfDay | [0]" --output text)
    [ "$snap" = "09:00" ] || { echo "$i: AutoSnapshot is not enabled at 09:00 ($snap); the add-on probe would change it. Aborting." >&2; exit 2; }
done
tag=$(aws_p lightsail get-instance --instance-name auratrade-1 --query "instance.tags[?key=='project'].value | [0]" --output text)
[ "$tag" = auratrade ] || { echo "auratrade-1 project tag is '$tag'; aborting." >&2; exit 2; }

failures=0
probe() {
    expected=$1; label=$2; shift 2
    if out=$("$@" 2>&1); then got=allowed
    elif printf '%s' "$out" | grep -qE 'AccessDenied|is not authorized to perform|UnauthorizedOperation'; then got=denied
    # Authorization passed and the target was then not found (the bucket probe).
    elif printf '%s' "$out" | grep -qE 'NotFoundException|DoesNotExist'; then got=allowed
    # Network, credential, throttling or validation errors prove nothing either way.
    else got=inconclusive
    fi
    if [ "$got" = "$expected" ]; then echo "ok    $expected  $label"
    else
        echo "FAIL  expected $expected, got $got  $label"
        [ "$got" = inconclusive ] && printf '      %s\n' "$(printf '%s' "$out" | head -n 3)"
        failures=$((failures + 1))
    fi
}

port22='fromPort=22,toPort=22,protocol=tcp,cidrs=0.0.0.0/0'
probe allowed "read inventory"                 aws_p lightsail get-instances --query "length(instances)"
probe allowed "access details auratrade-1"      aws_p lightsail get-instance-access-details --instance-name auratrade-1 --query "accessDetails.username"
probe denied  "access details tenfold-1"        aws_p lightsail get-instance-access-details --instance-name tenfold-1 --query "accessDetails.username"
probe allowed "re-open 22/tcp on auratrade-1"   aws_p lightsail open-instance-public-ports --instance-name auratrade-1 --port-info "$port22"
probe denied  "re-open 22/tcp on tenfold-1"     aws_p lightsail open-instance-public-ports --instance-name tenfold-1 --port-info "$port22"
probe denied  "re-enable snapshots auratrade-1" aws_p lightsail enable-add-on --resource-name auratrade-1 \
    --add-on-request 'addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=09:00}'
probe denied  "re-tag auratrade-1 unchanged"    aws_p lightsail tag-resource --resource-name auratrade-1 --tags key=project,value=auratrade
probe denied  "bucket access keys"              aws_p lightsail get-bucket-access-keys --bucket-name auratrade-probe-no-such-bucket
probe denied  "iam get-user TenFold"            aws_p iam get-user --user-name TenFold
probe allowed "iam get-user AuraTrade"          aws_p iam get-user --user-name AuraTrade

[ "$failures" -eq 0 ] && echo "All probes matched." || { echo "$failures probe(s) did not match." >&2; exit 1; }
