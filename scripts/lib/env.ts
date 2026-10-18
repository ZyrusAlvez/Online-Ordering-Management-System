import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Sets KEY=value in an env file: replaces the line if the key exists, else appends it. */
export const upsertEnv = (key: string, value: string, file = '.env.local') => {
  const line = `${key}=${value}`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}${line}\n`;
  writeFileSync(file, next);
};
