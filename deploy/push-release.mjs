import { spawnSync } from 'node:child_process';

const remote = 'https://github.com/lsevenn77-dev/aimusic.git';
const siteProject = 'appgprj_6aa56aec3434819186f9a42d9a557520';
const appMarkers = {
  android: 'app/android/app/src/main/AndroidManifest.xml',
  ios: 'app/ios/AIFECT.xcodeproj/project.pbxproj',
};

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', LC_ALL: 'C' },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function requireGit(args) {
  const result = git(args);
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
  return result.stdout.trim();
}

function remoteTip(ref) {
  const row = requireGit(['ls-remote', '--refs', remote, ref]);
  const [sha, name] = row.split('\t');
  if (!row) return null;
  if (name !== ref || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Unexpected GitHub response for ${ref}`);
  return sha;
}

function push(ref, sha, dryRun) {
  return git(['push', '--porcelain', ...(dryRun ? ['--dry-run'] : []), remote, `${sha}:${ref}`]);
}

function synchronize(platform, sha, dryRun) {
  if (requireGit(['cat-file', '-t', sha]) !== 'commit') throw new Error(`${sha} is not a commit`);
  if (platform === 'web') {
    const manifest = JSON.parse(requireGit(['show', `${sha}:.openai/hosting.json`]));
    if (manifest.project_id !== siteProject) throw new Error('The commit is for a different Sites project');
  } else {
    requireGit(['cat-file', '-e', `${sha}:${appMarkers[platform]}`]);
    const identityPath = platform === 'ios' ? appMarkers.ios : 'app/android/app/build.gradle';
    if (!requireGit(['show', `${sha}:${identityPath}`]).includes('kr.co.aifect.app')) {
      throw new Error(`The commit is for a different ${platform} application`);
    }
  }

  const releaseRef = `refs/heads/codex/aifect-${platform}-release`;
  if (remoteTip(releaseRef) === sha) return releaseRef;
  const result = push(releaseRef, sha, dryRun);
  if ((dryRun && result.status === 0) || remoteTip(releaseRef) === sha) return releaseRef;

  const failure = `${result.stdout}\n${result.stderr}`.trim();
  if (result.status !== 0 && !/\[rejected\] \((?:fetch first|non-fast-forward)\)/.test(failure)) throw new Error(failure);

  // Rollbacks and parallel releases can pin their source without moving the release branch backwards.
  const pinnedRef = `refs/heads/codex/aifect-deploy/${platform}/${sha}`;
  const pinnedTip = remoteTip(pinnedRef);
  if (pinnedTip === sha) return pinnedRef;
  if (pinnedTip) throw new Error(`GitHub already has a different commit at ${pinnedRef}`);
  const pinned = push(pinnedRef, sha, dryRun);
  if (dryRun && pinned.status === 0) return pinnedRef;
  if (remoteTip(pinnedRef) !== sha) throw new Error(pinned.stderr.trim() || pinned.stdout.trim() || `Could not verify ${pinnedRef}`);
  return pinnedRef;
}

try {
  const [platform, commit, ...flags] = process.argv.slice(2);
  const dryRun = flags.length === 1 && flags[0] === '--dry-run';
  if (!['web', 'android', 'ios'].includes(platform) || !/^[0-9a-f]{40}$/.test(commit ?? '') || (flags.length && !dryRun)) {
    throw new Error('Usage: node push-release.mjs <web|android|ios> <full-commit-sha> [--dry-run]');
  }
  const ref = synchronize(platform, commit, dryRun);
  console.log(JSON.stringify({ repository: 'lsevenn77-dev/aimusic', platform, commit, ref, dryRun }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
