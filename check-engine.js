#!/usr/bin/env node

const package = require('./package.json');
const semver = require('semver');

if (!semver.satisfies(process.version, package.engines.node)) {
  console.error('Invalid Node.js version:', process.version);
  console.error('This command-line utility requires Node.js version', package.engines.node);
  console.info('Download the latest version of Node.js from https://nodejs.org/en/download/current/');
  process.exit(1);
}
