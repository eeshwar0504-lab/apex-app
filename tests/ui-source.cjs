'use strict';
/* The UI source is split across src/main.tsx (entry), src/App.tsx, src/ui and src/screens; source-contract tests read it as one text. */
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const uiFiles = () => ['main.tsx', 'App.tsx'].map((f) => path.join(SRC, f)).concat(walk(path.join(SRC, 'ui')), walk(path.join(SRC, 'screens')));
const uiSource = () => uiFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n');
module.exports = { uiSource, uiFiles };
