import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

const port = Number(process.env.LUMA_DEV_PORT ?? 5174);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('LUMA_DEV_PORT must be an integer between 1024 and 65535.');
}

const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, LUMA_DEV_SERVER_URL: `http://127.0.0.1:${port}` },
});

let closing = false;
async function close(code) {
  if (closing) return;
  closing = true;
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await server.close();
  process.exitCode = code;
}
child.on('exit', (code) => void close(code ?? 0));
child.on('error', (error) => {
  console.error(error);
  void close(1);
});
process.on('SIGINT', () => void close(0));
process.on('SIGTERM', () => void close(0));
