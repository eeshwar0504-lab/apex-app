'use strict';
/*
 * Phase 6 (AI). The AI layer is additive and untrusted:
 *   30 provider architecture   - one provider-neutral interface, selection owned by the gateway, graceful failure
 *   31 grounded Coach          - a minimal, deterministic KNOWN / INFERRED / UNKNOWN context built from the Coach answer
 *   32 optional providers      - off, rule-based local fallback (not a model), local model, cloud (explicit, never required)
 *   33 deterministic boundary  - AI output is text; it cannot mutate state or bypass the engine, equipment or safety rules
 * No test needs a network or an API key: providers are exercised with fakes and a mocked fetch.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { ApexAIGateway, selectProvider } = E.aiGateway;
const { buildGroundedContext, renderPrompt } = E.aiGrounding;
const C = E.aiContract;

const TODAY = '2026-03-20';
const NOW = '2026-03-20T09:00:00.000Z';
const press = byId('machine_chest_press');

function appState(extra = {}) {
  const sess = (date) => session(press, date, threeSets(press, 20, 9));
  const base = {
    schemaVersion: 4, goals: [], workouts: [sess('2026-03-01'), sess('2026-03-04'), sess('2026-03-07'), sess('2026-03-10')], exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [],
    preferences: {}, activeRoute: 'home', onboardingComplete: true, coachMemory: [], workoutTemplates: [], learnedPreferences: {}, eventLog: [],
    profile: profile({ name: 'Private Person', equipment: ['machine', 'dumbbell', 'bench'], primaryGoal: 'general' })
  };
  return { ...base, ...extra };
}
const QUESTION = 'Why is my machine chest press staying the same?';
const ctxOf = (state = appState(), question = QUESTION) => buildGroundedContext(state, question, NOW, TODAY);

/* A provider fake: behaviour is whatever the test says. */
function fake({ id = 'custom', kind = 'cloud', available = true, reason, generate }) {
  return { id, kind, capabilities: { structuredOutput: true, requiresNetwork: kind !== 'rule-based', worksOffline: kind === 'rule-based', isLanguageModel: kind !== 'rule-based' }, availability: async () => (available ? { available: true } : { available: false, reason }), generate: generate || (async () => '{}') };
}
const json = (o) => JSON.stringify(o);
const respond = (response, extra = {}) => json({ response, groundedClaims: [], uncertainties: [], ...extra });
const explain = (adapter, context = ctxOf(), state = appState(), timeoutMs) => new ApexAIGateway(adapter, timeoutMs).explainGrounded(context, { exercises: state.exercises, equipment: state.profile.equipment });

function withFetch(impl, fn) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url: String(url), init }); return impl(String(url), init); };
  return Promise.resolve().then(() => fn(calls)).finally(() => { global.fetch = real; });
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

/* ================================================================= 30: provider architecture ================== */

test('A30.1 provider selection: off, rule-based, local model and cloud; cloud needs configuration, consent and a secure endpoint', () => {
  assert.equal(selectProvider(undefined).reason, 'ai_off');
  assert.equal(selectProvider({ mode: 'off' }).reason, 'ai_off');
  assert.equal(selectProvider({ mode: 'bogus' }).reason, 'ai_off');
  assert.equal(selectProvider({ mode: 'rule-based' }).adapter.kind, 'rule-based');
  assert.equal(selectProvider({ mode: 'local-model' }).adapter.kind, 'local-model');
  assert.equal(selectProvider({ mode: 'cloud' }).reason, 'not_configured');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: '', model: 'm', consent: true } }).reason, 'not_configured');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: 'https://example.test/v1/chat', model: 'm', consent: false } }).reason, 'consent_required');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: 'http://example.test/v1/chat', model: 'm', consent: true } }).reason, 'insecure_endpoint');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: 'not a url', model: 'm', consent: true } }).reason, 'insecure_endpoint');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: 'https://example.test/v1/chat', model: 'm', consent: true } }).adapter.kind, 'cloud');
  assert.equal(selectProvider({ mode: 'cloud', cloud: { endpoint: 'http://127.0.0.1:8080/v1/chat', model: 'm', consent: true } }).adapter.kind, 'cloud', 'loopback is allowed');
  // deterministic: the same config always selects the same thing
  for (const config of [{ mode: 'rule-based' }, { mode: 'local-model' }, { mode: 'off' }]) assert.equal(selectProvider(config).adapter?.kind, selectProvider(config).adapter?.kind);
});

test('A30.2 every adapter implements the one provider-neutral interface', () => {
  for (const mode of ['rule-based', 'local-model']) {
    const adapter = selectProvider({ mode }).adapter;
    for (const member of ['availability', 'generate']) assert.equal(typeof adapter[member], 'function', `${mode}.${member}`);
    assert.ok(adapter.id && adapter.kind && adapter.capabilities, mode);
    assert.equal(typeof adapter.capabilities.isLanguageModel, 'boolean');
  }
  const cloud = selectProvider({ mode: 'cloud', cloud: { endpoint: 'https://example.test/x', model: 'm', consent: true } }).adapter;
  assert.deepEqual(Object.keys(cloud.capabilities).sort(), ['isLanguageModel', 'requiresNetwork', 'structuredOutput', 'worksOffline']);
  assert.equal(selectProvider({ mode: 'rule-based' }).adapter.capabilities.isLanguageModel, false, 'the fallback is honest: it is not a model');
  assert.equal(selectProvider({ mode: 'local-model' }).adapter.capabilities.isLanguageModel, true);
});

test('A30.3 availability: the gateway reports it, and a failing availability check never throws', async () => {
  assert.deepEqual(await new ApexAIGateway().availability(), { available: false, reason: 'unavailable' });
  assert.deepEqual(await new ApexAIGateway({ mode: 'rule-based' }).availability(), { available: true });
  assert.equal((await new ApexAIGateway(fake({ available: false, reason: 'network' })).availability()).reason, 'network');
  const throwing = fake({}); throwing.availability = async () => { throw new Error('boom'); };
  assert.equal((await new ApexAIGateway(throwing).availability()).available, false);
  await withFetch(async () => { throw new Error('connection refused'); }, async () => {
    assert.equal((await new ApexAIGateway({ mode: 'local-model' }).availability()).available, false, 'no local server running');
  });
  await withFetch(async () => ok({ models: [] }), async (calls) => {
    assert.equal((await new ApexAIGateway({ mode: 'local-model' }).availability()).available, true);
    assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:11434\/api\/tags$/);
  });
});

test('A30.4 provider failures degrade to the deterministic Coach answer, with the reason, and never throw', async () => {
  const context = ctxOf();
  const cases = [
    ['unavailable provider', fake({ available: false, reason: 'unavailable' }), 'provider_unavailable'],
    ['network down', fake({ generate: async () => { throw new C.ProviderError('network'); } }), 'network'],
    ['timeout error', fake({ generate: async () => { throw new C.ProviderError('timeout'); } }), 'timeout'],
    ['unsupported capability', fake({ generate: async () => { throw new C.ProviderError('unsupported'); } }), 'unsupported'],
    ['missing configuration', fake({ available: false, reason: 'not_configured' }), 'not_configured'],
    ['http error', fake({ generate: async () => { throw new C.ProviderError('http_error'); } }), 'provider_error'],
    ['empty response', fake({ generate: async () => { throw new C.ProviderError('empty_response'); } }), 'malformed_output'],
    ['unknown crash', fake({ generate: async () => { throw new Error('anything'); } }), 'provider_error'],
    ['not json', fake({ generate: async () => 'Sure! Increase the load to 100 kg.' }), 'malformed_output'],
    ['empty json', fake({ generate: async () => '{}' }), 'malformed_output'],
    ['non-text', fake({ generate: async () => 42 }), 'malformed_output']
  ];
  for (const [label, adapter, reason] of cases) {
    const out = await explain(adapter, context);
    assert.equal(out.source, 'deterministic', label);
    assert.equal(out.fallbackReason, reason, label);
    assert.equal(out.text, context.deterministicAnswer, `${label}: the deterministic answer is what the person sees`);
    assert.match(out.disclaimer, /authoritative/);
  }
});

test('A30.5 a provider that never answers times out; the app does not hang', async () => {
  const out = await explain(fake({ generate: () => new Promise(() => {}) }), ctxOf(), appState(), 40);
  assert.equal(out.source, 'deterministic');
  assert.equal(out.fallbackReason, 'timeout');
});

test('A30.6 provider isolation: vendor wire formats live only in aiProviders; the gateway, contract, grounding and Coach know none', () => {
  const neutral = ['src/aiGateway.ts', 'src/aiContract.ts', 'src/aiGrounding.ts'];
  for (const file of neutral) {
    const text = read(file);
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file}: no network calls outside adapters`);
    assert.doesNotMatch(text, /choices\s*\[|"?role"?\s*:\s*['"]system|authorization|Bearer|api\/chat|response_format|from ['"](openai|@google|anthropic)/i, `${file}: no vendor request or response format`);
  }
  for (const file of fs.readdirSync(path.join(root, 'src/aiProviders'))) assert.match(read('src/aiProviders/' + file), /from '\.\.\/aiGateway'/, `${file} implements the gateway interface`);
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['openai', 'anthropic', '@anthropic-ai/sdk', '@google/generative-ai', 'ollama']) assert.equal(pkg.dependencies[dep], undefined, dep);
  for (const dir of ['src/coach', 'src/engine', 'src/data', 'src/knowledge']) for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.ts'))) assert.doesNotMatch(read(`${dir}/${file}`), /aiGateway|aiProviders|aiContract|aiGrounding/, `${dir}/${file} must not depend on the AI layer`);
  assert.doesNotMatch(read('src/main.tsx'), /aiProviders/, 'the app talks to the gateway, never to a provider');
});

test('A30.7 the adapters speak their own wire format to a mocked endpoint and classify failures', async () => {
  const input = { system: 's', user: 'u', context: ctxOf(), expectJson: true, timeoutMs: 500 };
  const local = selectProvider({ mode: 'local-model', local: { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'tiny' } }).adapter;
  await withFetch(async () => ok({ message: { content: ' {"response":"hi"} ' } }), async (calls) => {
    assert.equal(await local.generate(input), '{"response":"hi"}');
    assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/chat', 'a configured .../api/chat endpoint is not doubled');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'tiny');
    assert.equal(body.messages[0].role, 'system');
  });
  await withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }), async () => assert.rejects(local.generate(input), (e) => e.code === 'http_error'));
  await withFetch(async () => ok({ message: { content: '' } }), async () => assert.rejects(local.generate(input), (e) => e.code === 'empty_response'));
  await withFetch(async () => { throw new Error('refused'); }, async () => assert.rejects(local.generate(input), (e) => e.code === 'network'));
  const cloud = selectProvider({ mode: 'cloud', cloud: { endpoint: 'https://example.test/v1/chat', model: 'm', apiKey: 'test-key-not-real', consent: true } }).adapter;
  await withFetch(async () => ok({ choices: [{ message: { content: '{"response":"hi"}' } }] }), async (calls) => {
    assert.equal(await cloud.generate(input), '{"response":"hi"}');
    assert.equal(calls[0].init.headers.authorization, 'Bearer test-key-not-real');
    assert.doesNotMatch(String(calls[0].init.body), /test-key-not-real/, 'the key is a header only, never part of the prompt');
  });
  const keyless = selectProvider({ mode: 'cloud', cloud: { endpoint: 'https://example.test/v1/chat', model: 'm', consent: true } }).adapter;
  await withFetch(async () => ok({ choices: [{ message: { content: 'x' } }] }), async (calls) => { await keyless.generate(input); assert.equal(calls[0].init.headers.authorization, undefined); });
  await withFetch(async () => ok({ choices: [] }), async () => assert.rejects(cloud.generate(input), (e) => e.code === 'empty_response'));
});

/* ================================================================== 31: grounded Coach ======================== */

test('A31.1 the grounding context is deterministic: identical state gives a byte-identical context', () => {
  const a = JSON.stringify(ctxOf());
  for (let i = 0; i < 5; i++) assert.equal(JSON.stringify(ctxOf()), a);
  assert.equal(JSON.stringify(ctxOf(appState())), a, 'a rebuilt, equal state gives the same context');
  // history stored in another order is the same history
  const shuffled = appState(); shuffled.workouts = [...shuffled.workouts].reverse();
  assert.equal(JSON.stringify(ctxOf(shuffled)), a);
  assert.deepEqual(ctxOf().candidates, ctxOf().candidates);
});

test('A31.2 KNOWN, INFERRED and UNKNOWN stay separate, and the prompt preserves the distinction', () => {
  const context = ctxOf();
  assert.equal(context.version, 1);
  assert.equal(context.date, TODAY);
  assert.ok(context.known.length > 0, 'deterministic facts are known');
  assert.ok(context.inferred.some((f) => f.id === 'coach_confidence'), 'the Coach\'s own reading is inferred, not known');
  assert.ok(context.known.every((f) => f.id && f.statement));
  const ids = [...context.known, ...context.inferred].map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'fact ids are unique');
  // missing evidence is UNKNOWN: no recovery check-in exists in this state
  const recovery = ctxOf(appState(), 'Am I recovered enough to train today?');
  assert.ok(recovery.unknown.length > 0, 'a question with no recovery data lists what is missing');
  const prompt = renderPrompt(context);
  for (const part of ['KNOWN (deterministic facts)', 'INFERRED', 'UNKNOWN (missing information)', 'CANDIDATES', 'COACH ANSWER TO EXPLAIN', 'groundedClaims', 'authoritative']) assert.match(prompt.system, new RegExp(part.replace(/[()]/g, '\\$&')), part);
  for (const f of context.known) assert.ok(prompt.system.includes(`[${f.id}]`));
  assert.match(prompt.system, /Never state or change a load, set count, rep count or rest time/);
  assert.match(prompt.system, /Never say an exercise is medically safe or unsafe/);
  assert.equal(prompt.user, context.question);
});

test('A31.3 the context is minimal: no identity, no unrelated history, no state dump, bounded size', () => {
  const state = appState();
  state.journal = [{ id: 'j1', date: '2026-03-02', scope: 'general', text: 'SECRET-JOURNAL-TEXT about my knee', tags: [] }];
  state.measurements = [{ id: 'm1', date: '2026-03-02', values: { weightKg: 83.37 } }];
  state.workouts.push(session(byId('leg_press'), '2026-03-08', threeSets(byId('leg_press'), 140, 10)));
  const text = JSON.stringify(ctxOf(state));
  assert.doesNotMatch(text, /Private Person|SECRET-JOURNAL-TEXT|83\.37/, 'identity, notes and measurements are not sent');
  assert.doesNotMatch(text, /leg_press|140/, 'history unrelated to the question is not sent');
  assert.ok(text.length < 6000, `context size ${text.length}`);
  assert.deepEqual(Object.keys(ctxOf()).sort(), ['candidates', 'confidence', 'date', 'deterministicAnswer', 'exercise', 'inferred', 'intent', 'known', 'question', 'safetyGated', 'unknown', 'version']);
  const long = buildGroundedContext(state, 'x'.repeat(5000), NOW, TODAY);
  assert.ok(long.question.length <= 500);
});

test('A31.4 candidates are exactly what the deterministic layer validated: current, graph variations, equivalent alternatives, equipment respected', () => {
  const machineOnly = appState(); machineOnly.profile = profile({ equipment: ['machine'] });
  const withDumbbells = appState();
  const names = (s) => ctxOf(s).candidates.map((c) => `${c.relation}:${c.id}`);
  assert.ok(names(withDumbbells).includes('harder_variation:dumbbell_bench_press'));
  assert.ok(!names(machineOnly).includes('harder_variation:dumbbell_bench_press'), 'no dumbbells: not a candidate');
  assert.ok(names(machineOnly).includes('current:machine_chest_press'));
  for (const s of [machineOnly, withDumbbells]) for (const c of ctxOf(s).candidates) assert.notEqual(T.equipmentFit(byId(c.id), s.profile.equipment), 'unavailable', c.id);
  assert.ok(ctxOf().candidates.filter((c) => c.relation === 'alternative').length <= 3);
});

test('A31.5 a grounded response is explained through the rule-based path; claims need real fact ids; missing context is asked for', async () => {
  const context = ctxOf();
  const out = await explain(selectProvider({ mode: 'rule-based' }).adapter, context);
  assert.equal(out.source, 'rule-based');
  assert.equal(out.fallbackReason, undefined);
  assert.ok(out.text.includes(context.deterministicAnswer.split('. ')[0]), 'it restates the deterministic answer');
  assert.match(out.disclaimer, /no AI model/);
  const low = ctxOf(appState({ workouts: [] }), 'Why is my machine chest press staying the same?');
  const lowOut = await explain(selectProvider({ mode: 'rule-based' }).adapter, low);
  assert.equal(low.confidence, 'low');
  assert.ok(lowOut.requestedClarification, 'low confidence with missing information asks for it');
  // claims
  const adapter = fake({ kind: 'cloud', generate: async () => respond(context.deterministicAnswer.split('. ')[0] + '.', { groundedClaims: [{ claim: 'real', factIds: [context.known[0].id] }, { claim: 'invented', factIds: ['fact_that_does_not_exist'] }, { claim: 'no ids', factIds: [] }], uncertainties: ['I cannot see sleep data.'], requestedClarification: 'How did the last set feel?' }) });
  const aiOut = await explain(adapter, context);
  assert.equal(aiOut.source, 'ai');
  assert.deepEqual(aiOut.vetted.claims.grounded.map((c) => c.claim), ['real']);
  assert.deepEqual(aiOut.vetted.claims.ungrounded, ['invented', 'no ids']);
  assert.deepEqual(aiOut.vetted.uncertainties, ['I cannot see sleep data.']);
  assert.equal(aiOut.requestedClarification, 'How did the last set feel?');
});

/* ================================================================ 32: optional providers ====================== */

test('A32.1 AI disabled and no provider: the deterministic answer, no fetch, no throw', async () => {
  await withFetch(async () => { throw new Error('must not be called'); }, async (calls) => {
    const context = ctxOf();
    for (const gateway of [new ApexAIGateway(), new ApexAIGateway({ mode: 'off' }), new ApexAIGateway(undefined)]) {
      const out = await gateway.explainGrounded(context, { exercises: EXERCISES });
      assert.equal(out.source, 'deterministic');
      assert.equal(out.provider, 'none');
      assert.equal(out.fallbackReason, 'ai_off');
      assert.equal(out.text, context.deterministicAnswer);
    }
    assert.equal(calls.length, 0, 'nothing is sent anywhere when AI is off');
  });
});

test('A32.2 the rule-based fallback is labelled as what it is: not a model, offline, no network', async () => {
  await withFetch(async () => { throw new Error('offline'); }, async (calls) => {
    const out = await explain(selectProvider({ mode: 'rule-based' }).adapter);
    assert.equal(out.source, 'rule-based');
    assert.equal(out.provider, 'rule-based');
    assert.notEqual(out.source, 'ai', 'never presented as an AI model');
    assert.equal(calls.length, 0, 'works with the network down because it never uses it');
  });
});

test('A32.3 a cloud provider is explicit: no request without consent, never to an insecure endpoint, and failure is graceful', async () => {
  await withFetch(async () => ok({}), async (calls) => {
    for (const config of [{ mode: 'cloud' }, { mode: 'cloud', cloud: { endpoint: 'https://example.test/x', model: 'm', consent: false } }, { mode: 'cloud', cloud: { endpoint: 'http://example.test/x', model: 'm', consent: true } }]) {
      const out = await new ApexAIGateway(config).explainGrounded(ctxOf(), { exercises: EXERCISES });
      assert.equal(out.source, 'deterministic');
      assert.ok(['not_configured', 'consent_required', 'insecure_endpoint'].includes(out.fallbackReason));
    }
    assert.equal(calls.length, 0, 'no data left the device');
  });
  await withFetch(async () => { throw new Error('offline'); }, async () => {
    const out = await new ApexAIGateway({ mode: 'cloud', cloud: { endpoint: 'https://example.test/x', model: 'm', consent: true } }).explainGrounded(ctxOf(), { exercises: EXERCISES });
    assert.equal(out.source, 'deterministic');
    assert.equal(out.fallbackReason, 'network', 'network unavailable: deterministic answer');
  });
});

test('A32.4 a local model works through the same path: mocked server, JSON contract, vetted text', async () => {
  const context = ctxOf();
  const answer = context.deterministicAnswer.split('. ')[0] + '.';
  await withFetch(async (url) => (url.endsWith('/api/tags') ? ok({ models: [] }) : ok({ message: { content: respond(answer) } })), async (calls) => {
    const out = await new ApexAIGateway({ mode: 'local-model' }).explainGrounded(context, { exercises: EXERCISES, equipment: ['machine'] });
    assert.equal(out.source, 'ai');
    assert.equal(out.provider, 'local');
    assert.ok(calls.every((c) => c.url.startsWith('http://127.0.0.1:11434/')), 'a local model is only ever contacted on the device');
    const chat = calls.find((c) => c.url.endsWith('/api/chat'));
    const sent = JSON.parse(chat.init.body).messages.map((m) => m.content).join('\n');
    assert.doesNotMatch(sent, /Private Person/, 'the prompt carries no identity');
  });
  await withFetch(async () => { throw new Error('refused'); }, async () => {
    const out = await new ApexAIGateway({ mode: 'local-model' }).explainGrounded(context, { exercises: EXERCISES });
    assert.equal(out.source, 'deterministic', 'no local server: APEX works without it');
  });
});

test('A32.5 no secret lives in the repository: no key in source, none persisted, the AI preference is a plain mode', () => {
  const sources = [];
  const walk = (dir) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) walk(rel); else if (/\.(ts|tsx|cjs|json)$/.test(e.name)) sources.push(rel); } };
  walk('src');
  for (const file of sources) assert.doesNotMatch(read(file), /sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|Bearer [A-Za-z0-9._-]{20,}/, `${file}: a key-shaped string`);
  assert.doesNotMatch(read('src/data/repository.ts'), /apiKey|api_key|authorization/i, 'the repository never stores a key');
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  assert.equal(s.preferences.aiMode ?? 'off', 'off', 'AI is off by default');
  s.onboardingComplete = true; s.profile = profile(); s.plan = T.buildPlan(s.profile, EXERCISES, []);
  s.preferences.aiMode = 'rule-based';
  repository.save(s);
  assert.equal(repository.load().preferences.aiMode, 'rule-based');
  assert.doesNotMatch([...store.values()].join(''), /apiKey|Bearer|consent/);
  s.preferences.aiMode = 'cloud';
  repository.save(s);
  assert.equal(repository.load().preferences.aiMode, 'off', 'cloud can never be switched on by a stored preference');
  s.preferences.aiMode = 'garbage';
  repository.save(s);
  assert.equal(repository.load().preferences.aiMode, 'off');
});

/* ========================================================= 33: the deterministic-engine boundary ============== */

const engineSnapshot = (state) => JSON.stringify({
  loads: EXERCISES.map((ex) => [ex.id, T.personalizedLoad(ex, state.workouts, state.profile, state.exercises, TODAY)]),
  plan: T.buildPlan(state.profile, state.exercises, []).exerciseSets,
  coach: (() => { const ev = E.coachMod.coachEvidenceFromState(state, TODAY); const r = E.coachMod.coach({ state, profile: state.profile, goals: [], primaryGoal: 'general', recentWorkoutIds: [], recentExerciseEntryIds: [], now: NOW, plateaus: ev.plateaus }); return [r.decision.action, r.decision.confidence, r.explanation]; })()
});

test('A33.1 output with fields outside the contract (load, actions, prescription) is rejected whole; nothing changes', async () => {
  const state = appState();
  const before = JSON.stringify(state);
  const loadBefore = engineSnapshot(state);
  const evil = [
    { response: 'Done.', load: 100 },
    { response: 'Done.', actions: [{ type: 'setLoad', exerciseId: 'machine_chest_press', kg: 100 }] },
    { response: 'Done.', prescription: { sets: 10, reps: 20 } },
    { response: 'Done.', groundedClaims: [{ claim: 'x', factIds: [], mutate: true }] },
    { response: 'Done.', workout: { exercises: [] } }
  ];
  for (const payload of evil) {
    const out = await explain(fake({ generate: async () => json(payload) }), ctxOf(state), state);
    assert.equal(out.source, 'deterministic', JSON.stringify(Object.keys(payload)));
    assert.equal(out.fallbackReason, 'malformed_output');
    assert.equal(out.text, ctxOf(state).deterministicAnswer);
  }
  assert.equal(JSON.stringify(state), before, 'the state object is untouched');
  assert.equal(engineSnapshot(state), loadBefore, 'the deterministic loads, plan and Coach decision are unchanged');
});

test('A33.2 sentences that state or instruct a prescription change are removed, in any wording or case', async () => {
  const context = ctxOf();
  const bad = [
    'I have set your load to 80 kg.', "I've changed the plan to 5 sets.", 'Increase the load to 100 kg.', 'INCREASE THE WEIGHT TO 90 KG NOW.', 'Use 12 reps and 4 sets next time.', 'Reduce the rest to 30 seconds.',
    'Switch your workout to a heavier day.', 'Add two sets to the plan.', 'Update your prescription to 25 kg.', 'Go with 55 kg on the next set.'
  ];
  for (const sentence of bad) {
    const out = await explain(fake({ generate: async () => respond(`${sentence} ${context.deterministicAnswer.split('. ')[0]}.`) }), context);
    assert.ok(!out.text.includes(sentence), `kept: ${sentence}`);
    if (out.source === 'ai') assert.ok(out.vetted.removed.some((r) => r.sentence === sentence), `reported: ${sentence}`);
  }
  // restating a number that the context contains is fine; a negation is a statement, not an instruction
  const known = context.deterministicAnswer.match(/\d+(\.\d+)?\s?(kg|reps)/i);
  const fine = [known ? `The Coach's answer mentions ${known[0]}.` : 'The Coach answered.', 'This explanation does not change your plan.', 'APEX never changes your load for you.'];
  const out = await explain(fake({ generate: async () => respond(fine.join(' ')) }), context);
  assert.equal(out.source, 'ai');
  for (const sentence of fine) assert.ok(out.text.includes(sentence), `dropped: ${sentence}`);
});

test('A33.3 an invented number, date or past session is rejected or marked ungrounded', async () => {
  const context = ctxOf();
  const invented = ['On 2026-01-01 you squatted 200 kg for 5 reps.', 'Last Tuesday you set a personal record.', 'You benched 62.5 kg yesterday.', 'Your best set was 42 reps.'];
  for (const sentence of invented) {
    const out = await explain(fake({ generate: async () => respond(`${sentence} ${context.deterministicAnswer.split('. ')[0]}.`, { groundedClaims: [{ claim: sentence, factIds: ['made_up_fact'] }] }) }), context);
    assert.ok(!out.text.includes(sentence), `kept: ${sentence}`);
    if (out.source === 'ai') assert.deepEqual(out.vetted.claims.ungrounded, [sentence]);
  }
  const all = await explain(fake({ generate: async () => respond(invented.join(' ')) }), context);
  assert.equal(all.source, 'deterministic', 'when nothing survives, the deterministic answer is shown');
  assert.equal(all.fallbackReason, 'rejected_output');
  assert.equal(all.text, context.deterministicAnswer);
});

test('A33.4 a claim that an exercise is medically safe (or a diagnosis) is never shown as an authoritative statement', async () => {
  const context = ctxOf();
  for (const sentence of ['The machine chest press is medically safe for you.', 'This is safe for you to do.', 'It is safe to continue training through the pain.', 'You are cleared to train.', 'That sounds like a rotator cuff injury, so rest it.', 'This will treat your shoulder pain.', 'There is no risk with this.', 'It is unsafe for your knee.']) {
    const out = await explain(fake({ generate: async () => respond(`${sentence} ${context.deterministicAnswer.split('. ')[0]}.`) }), context);
    assert.ok(!out.text.includes(sentence), `kept: ${sentence}`);
  }
});

test('A33.5 an exercise suggestion is validated independently: unavailable and non-candidate exercises are removed, candidates are kept', async () => {
  const state = appState(); state.profile = profile({ equipment: ['machine'] });
  const context = ctxOf(state);
  const lead = context.deterministicAnswer.split('. ')[0] + '.';
  const run = async (sentence) => explain(fake({ generate: async () => respond(`${sentence} ${lead}`) }), context, state);
  let out = await run('You could try the Barbell Bench Press instead.');
  assert.ok(!out.text.includes('Barbell Bench Press'));
  assert.equal(out.vetted.removed.find((r) => /Barbell/.test(r.sentence)).reason, 'exercise_unavailable', 'needs equipment the athlete lacks');
  out = await run('You could try the Dumbbell Bench Press.');
  assert.equal(out.vetted.removed.find((r) => /Dumbbell Bench/.test(r.sentence)).reason, 'exercise_unavailable', 'dumbbells are not in this setup');
  out = await run('Consider Leg Press for variety.');
  assert.equal(out.vetted.removed.find((r) => /Leg Press/.test(r.sentence)).reason, 'exercise_not_a_candidate', 'available, but the deterministic layer did not offer it');
  out = await run('The Machine Chest Press is the exercise being discussed.');
  assert.ok(out.text.includes('Machine Chest Press'), 'the current exercise is allowed');
  // a candidate from the exercise graph is allowed once the equipment exists
  const full = appState();
  const fullCtx = ctxOf(full);
  out = await explain(fake({ generate: async () => respond(`A harder variation exists: Dumbbell Bench Press. ${fullCtx.deterministicAnswer.split('. ')[0]}.`) }), fullCtx, full);
  assert.ok(out.text.includes('Dumbbell Bench Press'));
  assert.deepEqual(out.vetted.removed, []);
});

test('A33.6 malformed structured output is a safe fallback, never an exception', async () => {
  const context = ctxOf();
  const bad = ['', '   ', 'null', '[]', '"just a string"', '{"response":', '{"response": 42}', '{"response": ""}', '{"response":"ok","groundedClaims":"nope"}', '{"response":"ok","groundedClaims":[{"claim":1,"factIds":[]}]}', '{"response":"ok","uncertainties":[1,2]}', '{"response":"ok","requestedClarification":{"a":1}}', json({ response: 'x'.repeat(100000) }), '<html>502 Bad Gateway</html>', '```json\n{"response":\n```'];
  for (const raw of bad) {
    const out = await explain(fake({ generate: async () => raw }), context);
    assert.equal(out.source, 'deterministic', JSON.stringify(raw.slice(0, 40)));
    assert.equal(out.text, context.deterministicAnswer);
  }
  assert.equal(C.parseAIOutput('```json\n{"response":"fenced is fine"}\n```').ok, true, 'a fenced JSON block is tolerated');
});

test('A33.7 contradictory prescription values cannot alter anything: they are removed and the engine result is identical', async () => {
  const state = appState();
  const snapshot = engineSnapshot(state);
  const context = ctxOf(state);
  const out = await explain(fake({ generate: async () => respond('Use 20 kg. Actually use 25 kg. No, use 100 kg for 3 sets of 20 reps. ' + context.deterministicAnswer.split('. ')[0] + '.') }), context, state);
  assert.ok(!/100 kg|25 kg|3 sets|20 reps/.test(out.text.replace(context.deterministicAnswer, '')));
  assert.equal(engineSnapshot(state), snapshot);
  assert.deepEqual(T.personalizedLoad(press, state.workouts, state.profile, state.exercises, TODAY), T.personalizedLoad(press, state.workouts, state.profile, state.exercises, TODAY));
});

test('A33.8 different providers (or none) on the same state leave the deterministic engine result identical (metamorphic)', async () => {
  const state = appState();
  const snapshot = engineSnapshot(state);
  const stateJson = JSON.stringify(state);
  const context = ctxOf(state);
  const lead = context.deterministicAnswer.split('. ')[0] + '.';
  const providers = [
    undefined,
    { mode: 'rule-based' },
    fake({ id: 'custom', kind: 'cloud', generate: async () => respond(lead) }),
    fake({ id: 'local', kind: 'local-model', generate: async () => respond(`Set the load to 500 kg. ${lead}`) }),
    fake({ id: 'custom', kind: 'cloud', generate: async () => json({ response: 'x', actions: ['setLoad'] }) }),
    fake({ id: 'custom', kind: 'cloud', generate: async () => { throw new Error('down'); } }),
    fake({ id: 'custom', kind: 'cloud', generate: async () => 'not json at all' })
  ];
  const outputs = [];
  for (const p of providers) {
    const out = await new ApexAIGateway(p).explainGrounded(context, { exercises: state.exercises, equipment: state.profile.equipment });
    outputs.push(out.source);
    assert.equal(engineSnapshot(state), snapshot, `engine unchanged after ${p ? (p.id || p.mode) : 'no provider'}`);
    assert.equal(JSON.stringify(state), stateJson, 'state unchanged');
    assert.equal(JSON.stringify(ctxOf(state)), JSON.stringify(context), 'grounding unchanged');
  }
  assert.deepEqual(outputs, ['deterministic', 'rule-based', 'ai', 'ai', 'deterministic', 'deterministic', 'deterministic'], 'the outcomes differ; the engine does not');
});

test('A33.9 architecture: the AI layer can read the engine but has no way to write training state', () => {
  const aiFiles = ['src/aiGateway.ts', 'src/aiContract.ts', 'src/aiGrounding.ts', ...fs.readdirSync(path.join(root, 'src/aiProviders')).map((f) => 'src/aiProviders/' + f)];
  const allowedImports = new Set(['./core/types', './aiContract', './aiGrounding', './aiGateway', './aiProviders/localOllama', './aiProviders/openAICompatible', './aiProviders/ruleBased', './engine/exerciseGraph', './engine/exerciseSafety', './engine/intelligence', './coach/askCoach', '../aiGateway', '../aiContract']);
  for (const file of aiFiles) {
    const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(allowedImports.has(m[1]), `${file} imports ${m[1]}, which is outside the AI layer's allowed read-only imports`);
    assert.doesNotMatch(text, /repository|localStorage|applyWorkoutAdaptation|createWorkout|addExerciseToWorkout|applyProfileDraft|applyGoalDraft|applyJournalDraft|setS\(|update\(|structuredClone|\.push\(.*workouts/, `${file}: nothing that writes state`);
  }
  // the outcome type is text and metadata only
  const gateway = read('src/aiGateway.ts');
  const outcome = gateway.slice(gateway.indexOf('export interface AIOutcome'), gateway.indexOf('export const DETERMINISTIC_NOTE'));
  for (const field of ['action', 'mutation', 'patch', 'load', 'prescription', 'workout']) assert.doesNotMatch(outcome, new RegExp(`\\b${field}\\b\\s*[?:]`), `AIOutcome has no ${field} field`);
  // the structured contract is closed
  assert.deepEqual(['response', 'groundedClaims', 'uncertainties', 'requestedClarification'].sort(), [...read('src/aiContract.ts').match(/ALLOWED_KEYS = new Set\(\[([^\]]+)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort());
  // in the app the AI result is only ever shown as a message
  const main = read('src/main.tsx');
  const uses = [...main.matchAll(/outcome\.[a-zA-Z]+/g)].map((m) => m[0]);
  assert.ok(uses.length > 0);
  assert.doesNotMatch(main.slice(main.indexOf('const explainWithAI'), main.indexOf('const ask=')), /update\(|setS\(|mutate\(/, 'the AI result is not written into state');
});

test('A33.10 the app shows deterministic Coach text and AI text as different things, and AI is optional in the UI', () => {
  const main = read('src/main.tsx');
  assert.match(main, /APEX COACH · DETERMINISTIC/);
  assert.match(main, /AI-GENERATED EXPLANATION/);
  assert.match(main, /RULE-BASED SUMMARY · NO AI MODEL/);
  assert.match(main, /aiMode\|\|'off'/);
  assert.match(main, /The Coach answer above is unchanged/);
  assert.doesNotMatch(main, /value="cloud"/, 'cloud is not selectable in the UI: it needs explicit configuration');
});
