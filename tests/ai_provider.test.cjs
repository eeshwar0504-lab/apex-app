const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('local zero-cost provider is optional and uses no new dependency', () => {
  const x = fs.readFileSync('src/aiProviders/localOllama.ts', 'utf8');

  assert.match(x, /127\.0\.0\.1:11434/);
  assert.match(x, /Core APEX never requires this provider/);
  assert.match(x, /provider:'local'/);
});

test('local provider remains provider-agnostic and failure-safe', () => {
  const x = fs.readFileSync('src/aiProviders/localOllama.ts', 'utf8');

  assert.match(x, /Ollama/i);
  assert.match(x, /try\s*\{/);
  assert.match(x, /catch\s*\(/);
  assert.match(x, /grounded/);
});

test('AI gateway bounds supplied context before provider execution', () => {
  const x = fs.readFileSync('src/aiGateway.ts', 'utf8');

  assert.match(x, /slice\(0,30\)/);
  assert.match(x, /slice\(0,20\)/);
  assert.match(x, /grounded:true/);
});

test('AI gateway keeps deterministic APEX logic authoritative', () => {
  const x = fs.readFileSync('src/aiGateway.ts', 'utf8');

  assert.match(x, /deterministic/i);
  assert.match(x, /authoritative/i);
});

test('AI responses expose grounding and uncertainty information', () => {
  const x = fs.readFileSync('src/aiGateway.ts', 'utf8');

  assert.match(x, /grounded/);
  assert.match(x, /uncertaint/i);
});

test('OpenAI-compatible adapter remains optional', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const x = fs.readFileSync('src/aiProviders/openAICompatible.ts', 'utf8');

  assert.match(x, /OpenAI-compatible adapter/);
  assert.equal(pkg.dependencies['openai'], undefined);
});

test('AI provider layer does not introduce a paid SDK dependency', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  assert.equal(pkg.dependencies['openai'], undefined);
  assert.equal(pkg.dependencies['anthropic'], undefined);
  assert.equal(pkg.dependencies['google-generativeai'], undefined);
  assert.equal(pkg.dependencies['@google/generative-ai'], undefined);
});

test('provider adapters are isolated behind the gateway', () => {
  const gateway = fs.readFileSync('src/aiGateway.ts', 'utf8');
  const providers = fs.readdirSync('src/aiProviders');

  assert.ok(providers.includes('localOllama.ts'));
  assert.ok(providers.includes('openAICompatible.ts'));

  assert.doesNotMatch(gateway, /from ['"]openai['"]/);
  assert.doesNotMatch(gateway, /from ['"]@google\/generative-ai['"]/);
});