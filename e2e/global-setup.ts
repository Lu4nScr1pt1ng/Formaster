import { execFileSync } from 'node:child_process';

/**
 * Every spec loads `.output/chrome-mv3` as an unpacked extension. Building
 * it once here — rather than expecting contributors to remember `npm run
 * build` first — is what makes `npm run test:e2e` a single, reliable
 * command: no stale build silently tested, no "works on my machine" from
 * someone who forgot to rebuild after a source change.
 */
export default function globalSetup(): void {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: process.cwd() });
}
