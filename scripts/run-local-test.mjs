import { spawn } from 'node:child_process';

const [testFile, ...args] = process.argv.slice(2);
if (!testFile) {
  console.error('Missing test file.');
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_USE_ENV_PROXY: '0',
  LOCAL_DASHBOARD: 'true',
  ASTRO_TELEMETRY_DISABLED: '1'
};
for (const key of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'NPM_CONFIG_PROXY',
  'NPM_CONFIG_HTTPS_PROXY',
  'npm_config_proxy',
  'npm_config_https_proxy'
]) delete env[key];

const child = spawn(process.execPath, [testFile, ...args], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Test terminated by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
