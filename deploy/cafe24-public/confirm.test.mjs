import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./deploy-cafe24.mjs', import.meta.url));
const project = 'appgprj_6aa56aec3434819186f9a42d9a557520';
const commit = 'a'.repeat(40);
const revision = 'b'.repeat(64);
const pin = 'refs/heads/codex/aifect-deploy/web/' + commit;
const version = { project_id: project, id: 'saved', version_number: 8, deployment_id: 'published', source: { commit_sha: commit } };
const deployment = { project_id: project, id: 'published', version_id: 'saved', type: 'publish', status: 'succeeded', updated_at: '2026-11-28T01:00:00Z' };
const transport = `
  import cp from 'node:child_process';
  import { syncBuiltinESMExports } from 'node:module';
  let reads = 0;
  cp.execFileSync = (program, args, options) => {
    if (program === 'git' && args[0] === 'ls-remote') {
      const moved = ++reads === 2 && process.env.MOVE_TEST_REF === '1';
      return (moved ? 'c' : 'a').repeat(40) + '\\t' + args.at(-1);
    }
    if (program === 'ssh' && JSON.parse(options.input).action === 'confirm') {
      const {commit, revision} = JSON.parse(options.input);
      const current = '/opt/aifect-public-origin/releases/' + revision + '-' + commit;
      const routes = ['/', '/music'].map(path => ({path, status:200, webOrigin:'cafe24', revision}));
      return JSON.stringify({commit, revision, current, processDirectory:current, pid:81, routes});
    }
    throw Error('Unexpected subprocess: ' + program);
  };
  syncBuiltinESMExports();
`;

function run(t, { ref = pin, status = deployment, move = false, versions = [version], newerDeployments = [] } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'aifect-confirm-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(transport), cli, 'confirm', revision, ref], {
    cwd, input: JSON.stringify({ version, deployment: { ...status, unused: 'omit-from-receipt' }, versions, newerDeployments }),
    encoding: 'utf8', env: { ...process.env, MOVE_TEST_REF: move ? '1' : '0' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) assert.equal(existsSync(join(cwd, 'work/releases')), false);
  return result;
}

test('confirms the exact rollback ref and persists only selected Sites fields', t => {
  const result = run(t);
  assert.equal(result.status, 0, result.stderr);
  const { file, ...printed } = JSON.parse(result.stdout);
  assert.equal(printed.status, 'confirmed');
  assert.deepEqual(printed.github, { repository: 'lsevenn77-dev/aimusic', ref: pin, commit });
  const saved = readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(saved), printed);
  assert.equal(saved.includes('omit-from-receipt'), false);
});

test('a moving release branch leaves no success record', t => {
  const result = run(t, { ref: 'refs/heads/codex/aifect-web-release', move: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub expected/);
});

test('a newer draft permits confirmation, a newer production publish or missing status blocks it', t => {
  const newer = { ...version, version_number: 9, id: 'newer', deployment_id: null };
  const versions = [newer, version];
  assert.equal(run(t, { versions }).status, 0);
  newer.deployment_id = 'new-publish';
  assert.equal(run(t, { versions }).status, 1);
  const later = { ...deployment, id: 'new-publish', version_id: 'newer', updated_at: '2026-11-28T02:00:00Z' };
  assert.equal(run(t, { versions, newerDeployments: [later] }).status, 1);
  assert.equal(run(t, { versions, newerDeployments: [{ ...later, updated_at: '2026-11-27T23:00:00Z' }] }).status, 0);
});

test('rejects preview, pending or unrelated Sites evidence and unrelated Git refs', t => {
  for (const change of [{ type: 'preview' }, { status: 'pending' }, { version_id: 'older' }, { project_id: 'another' }]) {
    const result = run(t, { status: { ...deployment, ...change } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /matching get_site_version/);
  }
  const result = run(t, { ref: 'refs/heads/main' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /web ref/);
});
