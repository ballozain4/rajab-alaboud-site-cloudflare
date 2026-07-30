import { spawn } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd.exe' : 'npx';
const args = isWindows
  ? ['/d', '/s', '/c', 'npx astro dev --host 127.0.0.1 --port 4321']
  : ['astro', 'dev', '--host', '127.0.0.1', '--port', '4321'];

const child = spawn(command, args, {
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    CLOUDFLARE_PLATFORM_PROXY: 'false',
    LOCAL_DASHBOARD: 'true'
  },
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start the local dashboard server:', error);
  process.exit(1);
});
