"""Disposable Linux-only deployment tests; Docker/SSH/HTTP are synthetic stubs."""
import json
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHA = 'a' * 40
PREVIOUS = 'b' * 40
identity_spec = importlib.util.spec_from_file_location('image_identity', ROOT / 'deploy/image-identity.py')
identity_module = importlib.util.module_from_spec(identity_spec)
identity_spec.loader.exec_module(identity_module)


def metadata(kind):
    return {'Id': 'sha256:' + ('1' if kind == 'web' else '2') * 64, 'Os': 'linux', 'Architecture': 'amd64',
            'Config': {'Labels': {'org.opencontainers.image.revision': SHA}, 'Env': []},
            'RootFS': {'Type': 'layers', 'Layers': ['sha256:' + ('a' if kind == 'web' else 'b') * 64]}}


WEB = identity_module.image_identity(metadata('web'), SHA)
MIGRATE = identity_module.image_identity(metadata('migrate'), SHA)

STUB = r'''#!/usr/bin/env python3
import json,os,sys,time,shutil,subprocess,tarfile
from pathlib import Path
tool=Path(sys.argv[0]).name; args=sys.argv[1:]; text=' '.join(args)
with open(os.environ['CALL_LOG'],'a') as out: out.write(os.environ.get('TEST_RUN','')+' '+tool+' '+text+'\n')
if tool=='docker':
 if args[:2]==['image','inspect']:
  kind='web' if 'auratrade-web:' in text else 'migrate'
  value={'Id':'sha256:'+('1' if kind=='web' else '2')*64,'Os':'linux','Architecture':'amd64','Config':{'Labels':{'org.opencontainers.image.revision':os.environ['RELEASE_SHA']},'Env':[]},'RootFS':{'Type':'layers','Layers':['sha256:'+('a' if kind=='web' else 'b')*64]}}
  if os.environ.get('BAD_ID'):value['Id']='sha256:'+'3'*64
  if os.environ.get('BAD_CONTENT') or (os.environ.get('CHANGE_ON_IMPORT') and (Path(os.environ['HOME'])/'imported').exists()):value['RootFS']['Layers']=['sha256:'+'c'*64]
  if os.environ.get('BAD_LABEL'):value['Config']['Labels']['org.opencontainers.image.revision']='c'*40
  if os.environ.get('BAD_PLATFORM'):value['Architecture']='arm64'
  if os.environ.get('BAD_ENV'):value['Config']['Env']=['AUTH_SECRET=synthetic-private-value']
  if os.environ.get('UNKNOWN_ENV'):value['Config']['Env']=['UNEXPECTED_API_KEY=synthetic-private-value']
  if '--format' not in args:print(json.dumps([value]))
  else:
   template=args[args.index('--format')+1]
   if template=='{{.Id}}':print(value['Id'])
   elif 'Labels' in template:print(value['Config']['Labels']['org.opencontainers.image.revision'])
   else:print(value['Os']+'/'+value['Architecture'])
 elif args[0]=='inspect':print('true')
 elif 'pg_dump' in args:
  if os.environ.get('FAIL_DUMP'):sys.exit(1)
  print('synthetic database dump')
 elif args[0]=='save':sys.stdout.buffer.write(b'synthetic image archive')
 elif args[0]=='load':(Path(os.environ['HOME'])/'imported').write_text('loaded')
 elif 'migrate' in args and 'run' in args:
  if os.environ.get('FAIL_MIGRATE'):sys.exit(1)
  time.sleep(float(os.environ.get('MIGRATE_DELAY','0')))
 elif 'web' in args and 'up' in args and os.environ.get('AURATRADE_REVISION')==os.environ['RELEASE_SHA'] and os.environ.get('FAIL_WEB'):sys.exit(1)
elif tool=='curl':
 print(os.environ.get('REGISTER_STATUS','403') if '/api/auth/register' in text else os.environ.get('LOGIN_STATUS','200'))
elif tool=='crontab':
 if args==['-']:sys.stdin.read()
elif tool=='git':
 if args[0]=='rev-parse':print(os.environ.get('CHECKOUT_SHA',os.environ['RELEASE_SHA']))
 elif args[0]=='archive':
  target=next(x.split('=',1)[1] for x in args if x.startswith('--output='))
  with tarfile.open(target,'w') as archive:archive.add(os.environ['SOURCE_RELEASE'],arcname='.')
elif tool=='gh':
 if 'check-runs' in text:print(os.environ.get('CI_COUNT','1'))
 else:
  if os.environ.get('FAIL_MAIN_API'):sys.exit(1)
  if os.environ.get('BAD_MAIN_RESPONSE'):print('null');sys.exit(0)
  p=Path(os.environ['CALL_LOG']+'.latest');count=int(p.read_text()) if p.exists() else 0;p.write_text(str(count+1))
  stale=os.environ.get('STALE')=='1' or (os.environ.get('STALE')=='late' and count>0)
  print('c'*40 if stale else os.environ['RELEASE_SHA'])
elif tool=='scp' and os.environ.get('EXEC_REMOTE'):
 destination=Path(os.environ['HOME'])/args[-1].split(':',1)[1];destination.mkdir(parents=True,exist_ok=True)
 for source in args[-4:-1]:shutil.copy(source,destination)
 if os.environ.get('TAMPER_TRANSFER'):
  with (destination/'source.tar').open('ab') as out:out.write(b'tampered')
elif tool=='ssh':
 data=sys.stdin.read()
 if os.environ.get('EXEC_REMOTE'):
  command=['bash','-se'] if args[-1]=='bash -se' else ['bash','-c',args[-1]]
  sys.exit(subprocess.run(command,input=data,text=True,env=os.environ).returncode)
'''


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.base = self.home / 'auratrade'
        self.bin = self.home / 'bin'; self.bin.mkdir()
        self.log = self.home / 'calls'
        for name in ['docker', 'curl', 'crontab', 'git', 'gh', 'ssh', 'scp', 'sleep']:
            file = self.bin / name; file.write_text(STUB); file.chmod(0o700)
        for revision in [SHA, PREVIOUS]:
            folder = self.base / 'releases' / revision / 'deploy'
            folder.mkdir(parents=True)
            for name in ['server-deploy.sh', 'image-identity.py', 'backup.sh', 'dc.sh', 'health-status.py', 'restore-check.sh']:
                shutil.copy(ROOT / 'deploy' / name, folder / name)
            (folder / 'compose.yaml').write_text('synthetic fixture')
        (self.base / '.env').write_text('synthetic fixture')
        (self.base / 'CURRENT').write_text(PREVIOUS)
        self.env = {**os.environ, 'HOME': str(self.home), 'PATH': f'{self.bin}:{os.environ["PATH"]}', 'CALL_LOG': str(self.log),
                    'RELEASE_SHA': SHA, 'SOURCE_RELEASE': str(self.base / 'releases' / SHA), 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_REPOSITORY': 'rahul-reddy/AuraTrade', 'GITHUB_STEP_SUMMARY': str(self.home / 'summary')}

    def tearDown(self):
        self.temp.cleanup()

    def server(self, args=None, **env):
        return subprocess.run(['sh', str(self.base / 'releases' / SHA / 'deploy/server-deploy.sh'), *(args or [SHA, WEB, MIGRATE, 'example.com'])],
                              env={**self.env, **env}, capture_output=True, text=True)

    def runner(self, **env):
        return subprocess.run(['bash', str(ROOT / 'scripts/deploy-prebuilt.sh'), SHA, 'example.com', 'example.com', 'key', 'hosts'],
                              env={**self.env, **env}, capture_output=True, text=True)

    def calls(self):
        return self.log.read_text() if self.log.exists() else ''

    def current(self):
        return (self.base / 'CURRENT').read_text().strip()

    def test_prebuilt_success_backs_up_before_migration_and_never_builds(self):
        result = self.server()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertNotIn(' build ', calls)
        self.assertIn('--resolve example.com:443:127.0.0.1', calls)
        self.assertLess(calls.index('pg_dump'), calls.index('run --rm migrate'))
        self.assertLess(calls.index('run --rm migrate'), calls.index('up -d --wait --remove-orphans web caddy'))
        self.assertEqual(self.current(), SHA)
        self.assertTrue((self.base / 'releases' / PREVIOUS).is_dir())
        self.assertEqual(json.loads((self.base / 'health/status.json').read_text())['backup']['state'], 'success')

    def test_untrusted_image_metadata_blocks_before_backup(self):
        for flag in ['BAD_CONTENT', 'BAD_LABEL', 'BAD_PLATFORM', 'BAD_ENV']:
            with self.subTest(flag=flag):
                self.assertNotEqual(self.server(**{flag: '1'}).returncode, 0)
                self.assertEqual(self.current(), PREVIOUS)
                self.assertNotIn('pg_dump', self.calls())

    def test_backup_or_migration_failure_keeps_previous_application(self):
        for flag in ['FAIL_DUMP', 'FAIL_MIGRATE']:
            with self.subTest(flag=flag):
                self.assertNotEqual(self.server(**{flag: '1'}).returncode, 0)
                self.assertEqual(self.current(), PREVIOUS)
                self.assertNotIn('up -d --wait --remove-orphans web caddy', self.calls())

    def test_failed_swap_or_public_health_rolls_back_without_reversing_migrations(self):
        for flags in [{'FAIL_WEB': '1'}, {'LOGIN_STATUS': '502'}, {'REGISTER_STATUS': '200'}]:
            with self.subTest(flags=flags):
                result = self.server(**flags)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.current(), PREVIOUS)
                self.assertIn('restoring the previous application', result.stderr)
                self.assertIn(f'releases/{PREVIOUS}/deploy', self.calls())

    def test_bad_arguments_never_build_or_mutate_current(self):
        for args in [[SHA], [SHA, WEB], ['../escape', WEB, MIGRATE], [SHA, WEB, MIGRATE, 'host;bad']]:
            self.assertNotEqual(self.server(args).returncode, 0)
            self.assertEqual(self.current(), PREVIOUS)
        self.assertNotIn(' build ', self.calls())

    def test_server_lock_serializes_overlapping_deployments(self):
        command = ['sh', str(self.base / 'releases' / SHA / 'deploy/server-deploy.sh'), SHA, WEB, MIGRATE, 'example.com']
        first = subprocess.Popen(command, env={**self.env, 'TEST_RUN': 'first', 'MIGRATE_DELAY': '0.2'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        second = subprocess.Popen(command, env={**self.env, 'TEST_RUN': 'second', 'MIGRATE_DELAY': '0.2'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        first.communicate(timeout=15); second.communicate(timeout=15)
        self.assertEqual((first.returncode, second.returncode), (0, 0))
        groups = []
        for line in self.calls().splitlines():
            label = line.split()[0]
            if not groups or groups[-1] != label: groups.append(label)
        self.assertEqual(len(groups), 2, groups)

    def test_runner_rejects_bad_checkout_ci_or_image_environment_without_ssh(self):
        for flags in [{'CHECKOUT_SHA': PREVIOUS}, {'CI_COUNT': '0'}, {'FAIL_MAIN_API': '1'}, {'BAD_MAIN_RESPONSE': '1'}, {'BAD_ENV': '1'}, {'UNKNOWN_ENV': '1'}, {'BAD_PLATFORM': '1'}, {'BAD_LABEL': '1'}]:
            with self.subTest(flags=flags):
                result = self.runner(**flags)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('synthetic-private-value', result.stdout + result.stderr)
                self.assertNotIn(' ssh ', self.calls())

    def test_stale_runner_skips_early_or_after_transfer_without_server_execution(self):
        for stale in ['1', 'late']:
            with self.subTest(stale=stale):
                state = Path(str(self.log)+'.latest')
                if state.exists(): state.unlink()
                self.log.write_text('')
                result = self.runner(STALE=stale)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn('bash -se', self.calls())
                if stale == '1': self.assertNotIn(' scp ', self.calls())
                else: self.assertIn(' scp ', self.calls())

    def test_runner_uses_pinned_ssh_and_both_artifacts_for_deployment(self):
        result = self.runner()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertIn('StrictHostKeyChecking=yes', calls)
        self.assertIn('UserKnownHostsFile=hosts', calls)
        self.assertIn('source.tar', calls)
        self.assertIn('images.tar.gz', calls)
        self.assertIn('bash -se', calls)

    def test_real_receiver_verifies_archives_and_runs_the_full_server_sequence(self):
        result = self.runner(EXEC_REMOTE='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('source.tar: OK', result.stdout)
        self.assertIn('images.tar.gz: OK', result.stdout)
        self.assertEqual(self.current(), SHA)
        self.assertIn('pg_dump', self.calls())
        self.assertEqual(list((self.base / 'incoming').iterdir()), [])
        self.assertIn(SHA, (self.home / 'summary').read_text())

    def test_cleanup_keeps_active_and_rollback_releases_even_outside_newest_three(self):
        for index, letter in enumerate('cdef'):
            folder = self.base / 'releases' / (letter * 40)
            folder.mkdir(); os.utime(folder, (100 + index, 100 + index))
        os.utime(self.base / 'releases' / SHA, (2, 2))
        os.utime(self.base / 'releases' / PREVIOUS, (1, 1))
        notes = self.base / 'releases' / 'operator-notes'; notes.mkdir(); os.utime(notes, (0, 0))
        result = self.server()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.base / 'releases' / SHA).is_dir())
        self.assertTrue((self.base / 'releases' / PREVIOUS).is_dir())
        self.assertTrue(notes.is_dir())
        self.assertFalse((self.base / 'releases' / ('c' * 40)).exists())

    def test_corrupt_transfer_is_rejected_before_image_load_and_incoming_files_are_removed(self):
        result = self.runner(EXEC_REMOTE='1', TAMPER_TRANSFER='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker load', self.calls())
        self.assertNotIn('pg_dump', self.calls())
        self.assertEqual(self.current(), PREVIOUS)
        self.assertEqual(list((self.base / 'incoming').iterdir()), [])

    def test_engine_specific_image_id_does_not_change_content_identity(self):
        result = self.server(BAD_ID='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.current(), SHA)

    def test_loaded_filesystem_change_is_blocked_before_backup(self):
        result = self.runner(EXEC_REMOTE='1', CHANGE_ON_IMPORT='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Image content identity mismatch', result.stderr)
        self.assertNotIn('pg_dump', self.calls())
        self.assertEqual(self.current(), PREVIOUS)

    def test_fingerprint_binds_runtime_settings_and_normalizes_only_empty_defaults(self):
        from copy import deepcopy
        original = metadata('web')
        baseline = identity_module.image_identity(original, SHA)
        compatible = deepcopy(original)
        compatible.update({'Id': 'different engine identifier', 'Created': 'different creation metadata', 'Variant': None})
        compatible['Config'].update({'User': None, 'Entrypoint': None, 'Volumes': None, 'Healthcheck': None})
        self.assertEqual(identity_module.image_identity(compatible, SHA), baseline)
        for key, value in [('Cmd', ['node', 'different.js']), ('Entrypoint', ['other']), ('Env', ['NODE_ENV=development']),
                           ('User', 'unrelated'), ('WorkingDir', '/other'), ('StopSignal', 'SIGQUIT'),
                           ('Healthcheck', {'Test': ['CMD', 'false']}), ('ExposedPorts', {'9999/tcp': {}}),
                           ('Volumes', {'/other': {}}), ('Shell', ['different']), ('OnBuild', ['RUN false'])]:
            changed = deepcopy(original); changed['Config'][key] = value
            self.assertNotEqual(identity_module.image_identity(changed, SHA), baseline, key)
        changed = deepcopy(original); changed['RootFS']['Layers'].append('sha256:' + 'f' * 64)
        self.assertNotEqual(identity_module.image_identity(changed, SHA), baseline)

    def test_receiver_migration_failure_retains_current_and_cleans_transferred_files(self):
        result = self.runner(EXEC_REMOTE='1', FAIL_MIGRATE='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('run --rm migrate', self.calls())
        self.assertEqual(self.current(), PREVIOUS)
        self.assertEqual(list((self.base / 'incoming').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
