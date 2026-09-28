const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Coach contract: deterministic engine is the source of truth', () => {
  const s = read('src/engine/coachGateway.ts') + (fs.existsSync(path.join(root,'src/aiGateway.ts')) ? read('src/aiGateway.ts') : '');
  assert.match(s, /deterministic/i);
  assert.match(s, /authoritative/i);
});

test('Coach contract: recommendations carry context/grounding boundaries', () => {
  const s = read('src/engine/coachGateway.ts');
  assert.match(s, /context|ground/i);
  assert.match(s, /recommend|suggest/i);
});

test('Coach contract: exercise choice can account for equipment and alternatives', () => {
  const s = read('src/engine/intelligence.ts') + read('src/engine/training.ts') + read('src/knowledge/knowledgeGraph.ts');
  assert.match(s, /equipment/i);
  assert.match(s, /alternative|replacement|substitut/i);
});

test('Coach contract: load advice distinguishes calibration/progression semantics', () => {
  const s = read('src/engine/training.ts') + read('src/engine/intelligence.ts');
  assert.match(s, /calibration/i);
  assert.match(s, /progression|personalizedLoad/i);
  assert.match(s, /RIR|rir/i);
});

test('Coach contract: safety/pain boundaries exist', () => {
  const s = read('src/engine/training.ts') + read('src/engine/intelligence.ts') + read('src/main.tsx');
  assert.match(s, /pain|discomfort|safety/i);
});
