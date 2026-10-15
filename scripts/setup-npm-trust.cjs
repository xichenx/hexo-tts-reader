#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const registry = '--registry=https://registry.npmjs.org/';
const trustArgs = [
  'trust', 'github', 'hexo-tts-reader',
  '--repo=xichenx/hexo-tts-reader', '--file=npm-publish.yml',
  '--allow-publish', registry,
];
const cwd = path.resolve(__dirname, '..');

function npm(args, capture = false) {
  // npm run supplies the CLI path; reuse it without shell interpolation.
  const cli = process.env.npm_execpath;
  const command = cli ? process.execPath : 'npm';
  const result = spawnSync(command, cli ? [cli, ...args] : args, {
    cwd,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) {
    throw new Error('Usage: npm run release:setup [-- --dry-run]');
  }
  console.log('Package: hexo-tts-reader\nRepository: xichenx/hexo-tts-reader');
  console.log('Workflow: npm-publish.yml\nPermission: npm publish');
  if (args.includes('--dry-run')) {
    console.log('\nWould check npm login, then run:\nnpm ' + trustArgs.join(' '));
    return;
  }

  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 14)) {
    throw new Error('Use Node.js 24 (or >=22.14) and npm >=11.15 for setup.');
  }
  const version = npm(['--version'], true);
  if (version.status !== 0) throw new Error('Could not read the npm version.');
  const [major, minor] = version.stdout.trim().split('.').map(Number);
  if (!Number.isInteger(major) || major < 11 || (major === 11 && minor < 15)) {
    throw new Error('npm >=11.15 is required. Run: npm install --global npm@11');
  }

  console.log('\nChecking npm login. Use a package maintainer account with 2FA enabled.');
  if (npm(['whoami', registry]).status !== 0) {
    console.log('Complete the official npm browser login to continue.');
    if (npm(['login', '--auth-type=web', registry]).status !== 0) {
      throw new Error('npm login did not complete. Run this setup again after signing in.');
    }
  }
  if (npm(trustArgs).status !== 0) {
    throw new Error('Trust setup did not complete. Check the npm error above. Existing trust configurations were not removed by this helper.');
  }
  console.log('\nTrusted publishing configured. Complete the first publish within 2 days.');
  console.log('For v0.2.0, run Node.js Package on main with the tag input v0.2.0.');
  console.log('Future stable GitHub Releases will publish automatically without NPM_TOKEN.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
