import type {FetchOptions} from './types.js';

export function isCI(opts?: FetchOptions): boolean {
  // Override for testing, so we don't have to much with process.env
  if (opts && ('CI' in opts)) {
    return Boolean(opts.CI);
  }

  const {env} = process;
  return Boolean(
    // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari,
    // GitHub Actions
    env.CI ||
    env.CONTINUOUS_INTEGRATION || // Travis CI, Cirrus CI
    env.BUILD_NUMBER || // Jenkins, TeamCity
    env.RUN_ID || // TaskCluster, dsari
    false
  );
}
