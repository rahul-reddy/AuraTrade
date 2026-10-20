"""Portable Docker content identity: runtime config + uncompressed layer digests.

Docker's engine-specific .Id can change when a Docker archive is imported into
containerd. The archive checksum still binds the exact transferred bytes; this
identity checks that the loaded tag preserves the filesystem and runtime config.
Created/history/engine IDs are intentionally excluded, not runtime behavior.
"""
import hashlib
import json
import re
import sys

ALLOWED_ENV = {'PATH', 'NODE_VERSION', 'YARN_VERSION', 'NODE_ENV',
               'NEXT_TELEMETRY_DISABLED', 'PORT', 'HOSTNAME'}


def image_identity(value, revision):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Invalid revision')
    config = value['Config']
    if value['Os'] != 'linux' or value['Architecture'] != 'amd64':
        raise ValueError('Unexpected image platform')
    if (config.get('Labels') or {}).get('org.opencontainers.image.revision') != revision:
        raise ValueError('Unexpected image revision')
    if any(item.partition('=')[0] not in ALLOWED_ENV for item in config.get('Env') or []):
        raise ValueError('Unexpected image environment')
    rootfs = value['RootFS']
    layers = rootfs['Layers']
    if rootfs['Type'] != 'layers' or not layers or any(not re.fullmatch(r'sha256:[0-9a-f]{64}', layer) for layer in layers):
        raise ValueError('Invalid image filesystem')
    # Normalize absent/null empty defaults that inspect APIs represent differently.
    runtime = {key: config.get(key) or [] for key in ['Env', 'Cmd', 'Entrypoint', 'Shell', 'OnBuild']}
    runtime.update({key: config.get(key) or '' for key in ['User', 'WorkingDir']})
    runtime.update({key: sorted((config.get(key) or {}).keys()) for key in ['Volumes', 'ExposedPorts']})
    runtime['Labels'] = config.get('Labels') or {}
    runtime['StopSignal'] = config.get('StopSignal') or 'SIGTERM'
    runtime['ArgsEscaped'] = bool(config.get('ArgsEscaped', False))
    health = config.get('Healthcheck') or {}
    runtime['Healthcheck'] = {'Test': health.get('Test') or [], **{
        key: health.get(key) or 0 for key in ['Interval', 'Timeout', 'StartPeriod', 'StartInterval', 'Retries']}}
    payload = {'Os': value['Os'], 'Architecture': value['Architecture'], 'Variant': value.get('Variant') or '',
               'OsVersion': value.get('OsVersion') or '', 'OsFeatures': value.get('OsFeatures') or [],
               'Config': runtime, 'Layers': layers}
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
    return 'sha256:' + hashlib.sha256(encoded).hexdigest()


if __name__ == '__main__':
    try:
        values = json.load(sys.stdin)
        if not isinstance(values, list) or len(values) != 1:
            raise ValueError('One image required')
        result = image_identity(values[0], sys.argv[1])
    except (ValueError, KeyError, TypeError, IndexError, AttributeError):
        raise SystemExit('Image identity validation failed; private metadata suppressed.')
    print(result)
