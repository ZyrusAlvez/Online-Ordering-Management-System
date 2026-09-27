import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Sets KEY=value in an env file, replacing the line if the key exists and
 * appending it otherwise. Leaves every other line — including comments —
 * exactly as it was.
 */
export const upsertEnv = (key, value, file = '.env') => {
  const line = `${key}=${value}`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}${line}\n`;

  writeFileSync(file, next);
};
