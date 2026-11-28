import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const buildDir = 'work/cafe24-public';
const sourceDir = 'ops/cafe24';
const buildFiles = ['renderer.mjs', 'shell.html', 'revision'];
const sourceFiles = ['service.mjs', 'product-media.mjs', 'package.json', 'package-lock.json'];
const projectId = 'appgprj_6aa56aec3434819186f9a42d9a557520';
const githubRepository = 'lsevenn77-dev/aimusic';
const commitSha = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
const hash = (...files) => {
  const h = createHash('sha256');
  for (const file of files) h.update(file);
  return h.digest('hex');
};

function run(program, args, options = {}) {
  return execFileSync(program, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options });
}

function prepare(commit, archivePath) {
  const git = (...args) => run('git', args);
  const head = git('rev-parse', 'HEAD').toString().trim();
  if (head !== commit) throw new Error('Open the Sites checkout at the published source commit.');
  const hosting = JSON.parse(git('show', commit + ':.openai/hosting.json'));
  if (hosting.project_id !== projectId) throw new Error('The source belongs to a different Sites project.');

  const files = Object.fromEntries([
    ...buildFiles.map(name => [name, readFileSync(resolve(buildDir, name))]),
    ...sourceFiles.map(name => [name, git('show', commit + ':' + sourceDir + '/' + name)]),
  ]);
  const revision = hash(files['renderer.mjs'], Buffer.from([0]), files['shell.html']);
  if (files.revision.toString().trim() !== revision) throw new Error('Cafe24 build revision does not match its files.');

  const archive = resolve(archivePath);
  const entries = run('tar', ['-tf', archive]).toString().trimEnd().split(/\r?\n/);
  function entry(name) {
    const accepted = ['dist/' + name, name];
    const matches = entries.filter(path => accepted.includes(path.replace(/^\.\//, '')));
    if (matches.length !== 1) throw new Error('Expected one Sites archive entry for ' + name);
    return run('tar', ['-xOf', archive, matches[0]]);
  }
  if (!entry('client/aifect-shell.txt').equals(files['shell.html'])) {
    throw new Error('Sites and Cafe24 contain different HTML shells.');
  }
  const worker = entry('server/index.js').toString('utf8');
  const originModule = worker.split('// server/cafe24-origin.js')[1]?.split('\n// ')[0];
  const embedded = /\brelease\d*\s*=\s*(?:true\s*\?\s*)?["']([a-f0-9]{64})["']/.exec(originModule ?? '')?.[1];
  if (embedded !== revision) throw new Error('The Sites Worker and Cafe24 contain different renderer revisions.');
  return { files, revision, hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)])) };
}

function remote(payload) {
  const script = readFileSync(new URL('./cafe24-release.py', import.meta.url), 'utf8');
  const quoted = "'" + script.replaceAll("'", "'\\''") + "'";
  const output = run('ssh', [
    '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no',
    'cafe24', 'python3 -c ' + quoted,
  ], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 220_000 });
  return JSON.parse(output);
}

function githubRelease(commit, ref) {
  const allowed = ['refs/heads/codex/aifect-web-release', 'refs/heads/codex/aifect-deploy/web/' + commit];
  if (!allowed.includes(ref)) throw new Error('Expected the web ref returned by push-release.mjs.');
  const output = run('git', ['ls-remote', '--refs', 'https://github.com/' + githubRepository + '.git', ref], {
    encoding: 'utf8', timeout: 25_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  }).trim();
  if (output !== commit + '\t' + ref) {
    throw new Error('GitHub expected ' + commit + ' on ' + ref + ', observed ' + (output || 'no ref'));
  }
  const [tip, name] = output.split('\t');
  return { repository: githubRepository, ref: name, commit: tip };
}

function confirm(revision, ref) {
  if (process.stdin.isTTY) throw new Error('Pipe the official Sites version and deployment JSON to confirm.');
  const { version, deployment, versions, newerDeployments = [] } = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  if (version?.project_id !== projectId || deployment?.project_id !== projectId ||
      !Number.isSafeInteger(version.version_number) || version.version_number < 1 ||
      typeof version.id !== 'string' || !version.id || version.id !== deployment.version_id ||
      typeof deployment.id !== 'string' || !deployment.id || deployment.id !== version.deployment_id ||
      deployment.type !== 'publish' || deployment.status !== 'succeeded' || !Number.isFinite(Date.parse(deployment.updated_at)) ||
      typeof version.source?.commit_sha !== 'string' || !commitSha.test(version.source.commit_sha)) {
    throw new Error('Expected matching get_site_version and successful production get_deployment_status results for AIFECT.');
  }
  const commit = version.source.commit_sha;
  const index = Array.isArray(versions) ? versions.findIndex(v => v.id === version.id) : -1;
  if (index < 0 || versions[index].project_id !== projectId || versions[index].version_number !== version.version_number ||
      versions[index].deployment_id !== deployment.id || versions[index].source?.commit_sha !== commit) {
    throw new Error('Refresh list_site_versions from the first page through the selected published version.');
  }
  for (const newer of versions.slice(0, index)) {
    if (newer.project_id !== projectId || newer.version_number <= version.version_number) throw new Error('Invalid Sites version list.');
    if (!newer.deployment_id) continue;
    const other = newerDeployments.find(d => d.project_id === projectId && d.id === newer.deployment_id && d.version_id === newer.id);
    if (other?.type === 'preview' || (other?.type === 'publish' && other.status === 'failed')) continue;
    if (other?.type !== 'publish' || other.status !== 'succeeded' || !(Date.parse(other.updated_at) < Date.parse(deployment.updated_at))) {
      throw new Error('Check the production deployment of Sites v' + newer.version_number + ' before confirming this release.');
    }
  }
  githubRelease(commit, ref);
  const cafe24 = remote({ action: 'confirm', commit, revision });
  if (cafe24.commit !== commit || cafe24.revision !== revision || !Number.isSafeInteger(cafe24.pid) || cafe24.pid < 1 ||
      !cafe24.current || cafe24.processDirectory !== cafe24.current ||
      !['/', '/music'].every(path => cafe24.routes?.some(r => r.path === path && r.status === 200 && r.webOrigin === 'cafe24' && r.revision === revision))) {
    throw new Error('Incomplete Cafe24 process or public route confirmation.');
  }
  const github = githubRelease(commit, ref);
  const receipt = {
    status: 'confirmed', checkedAt: new Date().toISOString(),
    sites: { projectId, version: version.version_number, latestSavedVersion: versions[0].version_number, versionId: version.id, deploymentId: deployment.id,
      status: deployment.status, deploymentUpdatedAt: deployment.updated_at, commit }, cafe24, github,
  };
  const dir = resolve('work/releases');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'confirmed-v' + version.version_number + '-' + randomUUID() + '.json');
  const tmp = file + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
  console.log(JSON.stringify({ ...receipt, file }));
}

function main() {
  const [action, commitOrRevision, ...args] = process.argv.slice(2);
  if (action === 'confirm' && sha256.test(commitOrRevision ?? '') && args.length === 1) {
    confirm(commitOrRevision, args[0]);
    return;
  }
  if (action === 'verify' && sha256.test(commitOrRevision ?? '') && args.length === 0) {
    console.log(JSON.stringify(remote({ action, revision: commitOrRevision })));
    return;
  }
  const [archive, previousRelease, ...extra] = args;
  if (!['check', 'stage', 'activate'].includes(action) || !commitSha.test(commitOrRevision ?? '') ||
      !archive || extra.length || (action === 'activate') !== Boolean(previousRelease)) {
    throw new Error('Usage: deploy-cafe24.mjs check|stage <commit_sha> <sites_archive>\n' +
      '       deploy-cafe24.mjs activate <commit_sha> <sites_archive> <previousRelease>\n' +
      '       deploy-cafe24.mjs verify <renderer_revision>\n' +
      '       deploy-cafe24.mjs confirm <renderer_revision> <github_ref>  (stdin: {version, deployment, versions, newerDeployments?})');
  }

  const commit = commitOrRevision;
  const { files, revision, hashes } = prepare(commit, archive);
  const payload = { action, commit, revision, hashes, previousRelease };
  if (action === 'check') {
    console.log(JSON.stringify({ commit, revision, matched: true }));
    return;
  }
  if (action === 'stage') {
    payload.files = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, bytes.toString('base64')]));
  }
  console.log(JSON.stringify(remote(payload)));
}

try {
  main();
} catch (error) {
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
}
