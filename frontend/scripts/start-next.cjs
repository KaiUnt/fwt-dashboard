const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// A project-local runtime lets this app upgrade without changing shared Node.
const runtimeRoot = path.resolve(__dirname, '../../.runtime/node');
const localNode = process.platform === 'win32'
  ? path.join(runtimeRoot, 'node.exe')
  : path.join(runtimeRoot, 'bin/node');
const hasLocalRuntime = existsSync(localNode);
const node = hasLocalRuntime ? localNode : process.execPath;

if (!hasLocalRuntime && Number(process.versions.node.split('.')[0]) < 22) {
  console.error('FWT Dashboard requires Node.js 22+ or a project-local .runtime/node installation.');
  process.exit(1);
}

const env = { ...process.env };
if (hasLocalRuntime) {
  env.PATH = `${path.dirname(node)}${path.delimiter}${env.PATH || ''}`;
}

const child = spawn(node, [require.resolve('next/dist/bin/next'), 'start', ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', error => {
  console.error(`Could not start FWT Dashboard: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  process.exit(code ?? signalCodes[signal] ?? 1);
});
