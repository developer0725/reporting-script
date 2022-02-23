#!/usr/bin/env node

require('./check-engine');

require('source-map-support/register');

const fs = require('fs-extra');
const path = require('path');
fs.copySync(path.join(__dirname, './configs'), path.join(__dirname, './dist/configs'));

require('./dist/lib');
