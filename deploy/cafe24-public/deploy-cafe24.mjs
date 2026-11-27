import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const buildDir = 'work/cafe24-public';
const sourceDir = 'ops/cafe24';
const buildFiles = ['renderer.mjs', 'shell.html', 'revision'];
const sourceFiles = ['service.mjs', 'product-media.mjs', 'package.json', 'package-lock.json'];
const projectId = 'appgprj_6aa56aec3434819186f9a42d9a557520';
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
  process.stdout.write(output);
}

function main() {
  const [action, commitOrRevision, archive, previousRelease, ...extra] = process.argv.slice(2);
  if (action === 'verify' && sha256.test(commitOrRevision ?? '') && !archive) {
    remote({ action, revision: commitOrRevision });
    return;
  }
  if (!['check', 'stage', 'activate'].includes(action) || !/^[a-f0-9]{40}$/.test(commitOrRevision ?? '') ||
      !archive || extra.length || (action === 'activate') !== Boolean(previousRelease)) {
    throw new Error('Usage: deploy-cafe24.mjs check|stage <commit_sha> <sites_archive>\n' +
      '       deploy-cafe24.mjs activate <commit_sha> <sites_archive> <previousRelease>\n' +
      '       deploy-cafe24.mjs verify <renderer_revision>');
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
  remote(payload);
}

try {
  main();
} catch (error) {
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
}
