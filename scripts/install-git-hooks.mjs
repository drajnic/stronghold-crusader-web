import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const repository = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: root,
  encoding: 'utf8',
});

if (repository.error?.code === 'ENOENT' || repository.status !== 0) {
  console.log('Skipping Git hooks: Git or a repository is unavailable.');
} else if (realpathSync(repository.stdout.trim()) !== root) {
  console.log('Skipping Git hooks: this package is not the Git repository root.');
} else {
  const result = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('Git hooks installed: pre-commit and pre-push run pnpm check.');
}
