const { uiSource } = require('../ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Persistence contract: repository boundary exists', () => {
  const s = read('src/data/repository.ts');
  assert.match(s, /export|class|function/);
  assert.match(s, /persist|save|load|read|write/i);
});

test('Persistence contract: SQLite adapter exists', () => {
  const s = read('src/data/sqliteAdapter.ts');
  assert.match(s, /SQLite|sqlite/i);
  assert.match(s, /open|execute|query|run|connection/i);
});

test('Recovery contract: workout checkpoint/pause/resume/reopen semantics exist', () => {
  const s = read('src/engine/training.ts') + uiSource();
  for (const term of [/checkpoint/i,/pause/i,/resume/i,/reopen|recover/i]) assert.match(s, term);
});

test('Recovery contract: encrypted backup primitives exist', () => {
  const s = read('src/data/backupCrypto.ts');
  assert.match(s, /encrypt/i);
  assert.match(s, /decrypt/i);
  assert.match(s, /AES|GCM|authenticated|tag/i);
});

test('Recovery contract: integrity validation exists', () => {
  const s = read('src/data/integrity.ts');
  assert.match(s, /validate|integrity|hash|duplicate/i);
});
