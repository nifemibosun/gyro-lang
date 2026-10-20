import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const distDir = path.join(root, 'dist');
const sourceConfigPath = path.join(root, 'sea.json');
const bundlePath = path.join(distDir, 'gyro-sea.cjs');
const generatedConfigPath = path.join(distDir, 'sea.generated.json');
const outputName = process.platform === 'win32' ? 'gyro.exe' : 'gyro';
const executablePath = path.join(root, outputName);

function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
  return result;
}

function findCliEntry() {
  return [
    path.join(root, 'src', 'cli.ts'),
    path.join(root, 'cli.ts'),
    path.join(distDir, 'cli.js'),
    path.join(distDir, 'src', 'cli.js'),
  ].find((candidate) => existsSync(candidate));
}

try {
  const [nodeMajor, nodeMinor] = process.versions.node
    .split('.')
    .map(Number);

  if (nodeMajor < 25 || (nodeMajor === 25 && nodeMinor < 5)) {
    throw new Error(
      `Native SEA requires Node.js 25.5.0 or newer. ` +
      `Current version: ${process.versions.node}.`
    );
  }

  if (process.platform !== 'win32') {
    console.warn(`Building a native SEA for ${process.platform}; the output is named "${outputName}".`);
  }

  const entry = findCliEntry();
  if (!entry) {
    throw new Error('Could not find the Gyro CLI entry');
  }

  if (!existsSync(sourceConfigPath)) {
    throw new Error(`Missing ${sourceConfigPath}. Restore sea.json from the project`);
  }
  const config = JSON.parse(readFileSync(sourceConfigPath, 'utf8'));

  mkdirSync(distDir, { recursive: true });
  console.log(`Bundling Gyro CLI from ${path.relative(root, entry)}...`);
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${nodeMajor}`,
    outfile: bundlePath,
    sourcemap: false,
    packages: 'bundle',
    logLevel: 'info',
  });

  const nativeConfig = {
    ...config,
    main: bundlePath,
    mainFormat: 'commonjs',
    output: executablePath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  writeFileSync(generatedConfigPath, `${JSON.stringify(nativeConfig, null, 2)}\n`, 'utf8');

  rmSync(executablePath, { force: true });
  run(process.execPath, ['--build-sea', generatedConfigPath], 'Native build');

  if (!existsSync(executablePath) || statSync(executablePath).size < 1024 * 1024) {
    throw new Error(`Node reported success, but the executable was not created or is unexpectedly small: ${executablePath}`);
  }

  console.log(`\nExecutable created: ${executablePath}`);
} catch (error) {
  console.error(`\nGyro build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
