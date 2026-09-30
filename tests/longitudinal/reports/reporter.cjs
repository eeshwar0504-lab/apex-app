'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const CATEGORY_ORDER = ['progressive_overload', 'rir', 'plateau', 'regression', 'recovery', 'missed_workouts', 'equipment', 'substitutions', 'prs', 'body_weight', 'nutrition', 'units', 'persistence', 'metamorphic', 'fuzz', 'edge_cases', 'browser_e2e', 'data_integrity'];

function git(cmd) { try { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } }

class Reporter {
  constructor(config) {
    this.config = config;
    this.records = [];       // {category,name,status,detail,seed,count?}
    this.failures = [];
    this.outDir = path.join(root, 'test-results');
    this.failDir = path.join(this.outDir, 'longitudinal');
    this.startedAt = Date.now();
    fs.rmSync(this.failDir, { recursive: true, force: true });
    this.totals = {};
    this.archetypeStats = {};
    this.passCounters = {}; // per-category aggregated pass/fail counts from population runs
  }
  add(r) { this.records.push(r); }
  addMany(list) { for (const r of list) this.add(r); }
  count(cat, ok, n = 1) { this.passCounters[cat] = this.passCounters[cat] || { pass: 0, fail: 0 }; this.passCounters[cat][ok ? 'pass' : 'fail'] += n; }

  summarize() {
    const cats = {};
    const bump = (c, s, n = 1) => { cats[c] = cats[c] || { pass: 0, fail: 0, review: 0 }; cats[c][s] += n; };
    for (const r of this.records) bump(r.category, r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'review');
    for (const [c, v] of Object.entries(this.passCounters)) { bump(c, 'pass', v.pass); bump(c, 'fail', v.fail); }
    const total = { pass: 0, fail: 0, review: 0 };
    for (const v of Object.values(cats)) { total.pass += v.pass; total.fail += v.fail; total.review += v.review; }
    return { cats, total };
  }

  writeFailure(f, extra = {}) {
    fs.mkdirSync(this.failDir, { recursive: true });
    const id = String(this.failures.length + 1).padStart(6, '0');
    const artifact = { id, ...f, ...extra };
    fs.writeFileSync(path.join(this.failDir, `failure-${id}.json`), JSON.stringify(artifact, null, 2));
    const md = [
      `# Failure ${id}: ${f.name}`, '',
      `- **Classification:** ${f.classification}`, `- **Severity:** ${f.severity}`, `- **Category:** ${f.category}`,
      `- **Seed:** ${f.seed ?? 'n/a'}`, `- **Scenario:** ${f.scenarioId ?? 'n/a'}`, `- **Archetype:** ${f.archetype ?? 'n/a'}`,
      `- **Simulated date:** ${f.date ?? 'n/a'}`, `- **Occurrences:** ${f.count ?? 1}`,
      `- **Reproduce:** \`${f.reproduce}\``, '', '## Expected / invariant', '', '```', String(f.expected ?? 'see detail'), '```', '',
      '## Actual', '', '```json', JSON.stringify(f.actual ?? f.detail ?? {}, null, 2), '```', '',
      extra.context ? '## Context (equipment, goal, history, prescriptions, performance)\n\n```json\n' + JSON.stringify(extra.context, null, 2) + '\n```\n' : '',
    ].join('\n');
    fs.writeFileSync(path.join(this.failDir, `failure-${id}.md`), md);
    this.failures.push(artifact);
    return id;
  }

  finish(extra = {}) {
    fs.mkdirSync(this.outDir, { recursive: true });
    const { cats, total } = this.summarize();
    const runtimeSec = Math.round((Date.now() - this.startedAt) / 100) / 10;
    const pkg = require(path.join(root, 'package.json'));
    const meta = {
      apexVersion: pkg.version, timestamp: new Date().toISOString(), gitCommit: git('git rev-parse --short HEAD'), gitDirty: git('git status --short').length > 0,
      node: process.version, level: this.config.level, baseSeed: this.config.baseSeed, seedRange: [this.config.baseSeed, this.config.baseSeed + this.config.users - 1],
      users: this.totals.users || 0, weeksPerUser: this.config.weeks, totalSimulatedWeeks: this.totals.weeks || 0, workouts: this.totals.workouts || 0, sets: this.totals.sets || 0,
      prescriptionsChecked: this.totals.prescriptions || 0, persistenceRoundTrips: this.totals.persistenceChecks || 0, unitToggles: this.totals.unitChecks || 0, substitutions: this.totals.substitutions || 0,
      prsRecorded: this.totals.prs || 0, coachContextChecks: this.totals.contextChecks || 0, plateauSignalChecks: this.totals.plateauChecks || 0, plateauSignalsRaised: this.totals.plateauFlags || 0, recoveryCheckInsStored: this.totals.recoveryCheckIns || 0, hostileRecoveryCheckIns: this.totals.hostileCheckIns || 0, layoffPrescriptionsChecked: this.totals.layoffPrescriptions || 0, sessionsAbandonedWithNoSets: this.totals.abandonedSessions || 0, metamorphicChecks: this.records.filter((r) => r.category === 'metamorphic').length, fuzzPropertyChecks: this.records.filter((r) => r.category === 'fuzz').length, fuzzCallsPerFunction: this.config.fuzz, scenarioChecks: this.records.length, browserScenarios: this.records.filter((r) => r.category === 'browser_e2e').length, runtimeSeconds: runtimeSec,
    };
    const summary = { meta, totals: total, categories: cats, archetypeStats: this.archetypeStats, failures: this.failures.map((f) => ({ id: f.id, name: f.name, severity: f.severity, category: f.category, seed: f.seed, archetype: f.archetype, reproduce: f.reproduce })), review: this.records.filter((r) => r.status === 'review').map((r) => ({ category: r.category, classification: r.classification || 'UNCLASSIFIED', name: r.name, detail: r.detail })), reviewClassificationCounts: this.records.filter((r) => r.status === 'review').reduce((a, r) => { const k = r.classification || 'UNCLASSIFIED'; a[k] = (a[k] || 0) + 1; return a; }, {}) };
    summary.validation = extra.validation || null;
    summary.originalReviewDisposition = extra.dispositions || [];
    summary.nativeDeviceValidation = 'NOT VERIFIED (no emulator/device available; Node simulation does not exercise the native Capacitor SQLite plugin)';
    fs.writeFileSync(path.join(this.outDir, 'longitudinal-summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.outDir, 'longitudinal-report.md'), this.markdown(meta, total, cats, extra));
    return { meta, total, cats };
  }

  markdown(meta, total, cats, extra) {
    const L = [];
    L.push('# APEX Longitudinal Simulation Report', '');
    L.push('> Generated automatically. Written so another AI/engineer can understand exactly what was simulated, what passed, what failed and what needs human review.', '');
    L.push('## What this test system does', '');
    L.push('An **independent synthetic athlete** (own strength state, adaptation, fatigue, sleep, attendance, noisy RIR reporting) trains through APEX\'s **real training engine** (`src/engine/training.ts`, compiled from the repository - no re-implemented formulas). Each simulated day the driver builds the workout, asks APEX for the load prescription, lets the athlete perform whatever they can actually do, logs the sets, completes the session and asks APEX again.');
    L.push('An **independent oracle** validates data integrity, equipment availability, PR correctness, progression consistency (against the history actually logged), unit conversion, persistence round trips and metamorphic relations. Formally defined deterministic rules are tested with exact expected values; unspecified behaviour is tested by invariants only and reported as **REVIEW**, never as a bug.', '');
    L.push('Status meanings: **PASS** contract met. **FAIL** hard failure (corruption, crash, violated defined rule). **REVIEW** valid but unexpected or specification-ambiguous behaviour that a human should judge.', '');
    L.push('## Run metadata', '', '| Field | Value |', '|---|---|');
    for (const [k, v] of Object.entries(meta)) L.push(`| ${k} | ${Array.isArray(v) ? v.join(' - ') : v} |`);
    L.push('', '## Totals', '', `- PASS: **${total.pass}**`, `- FAIL: **${total.fail}**`, `- REVIEW: **${total.review}**`, '');
    if (extra.validation) {
      L.push('## Validation results', '', '| Check | Result |', '|---|---|');
      for (const [k, v] of Object.entries(extra.validation)) L.push('| ' + k + ' | ' + v + ' |');
      L.push('');
    }
    L.push('## Breakdown by category', '', '| Category | PASS | FAIL | REVIEW |', '|---|---:|---:|---:|');
    for (const c of CATEGORY_ORDER.concat(Object.keys(cats).filter((c) => !CATEGORY_ORDER.includes(c)))) if (cats[c]) L.push(`| ${c} | ${cats[c].pass} | ${cats[c].fail} | ${cats[c].review} |`);
    L.push('', '_Population categories count one PASS/FAIL per simulated user; scenario categories count one per named check._', '');
    L.push('## Archetype behaviour (evidence, not verdicts)', '', '| Archetype | Users | Workouts | Avg prescribed-load gain % | Below-rep-range set rate | PRs | Missed sessions |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const [a, s] of Object.entries(this.archetypeStats)) L.push(`| ${a} | ${s.users} | ${s.workouts} | ${s.avgLoadGainPct} | ${s.avgBelowRangeRate} | ${s.prs} | ${s.missedSessions} |`);
    L.push('');
    L.push('## Failures', '');
    if (!this.failures.length) L.push('None.', '');
    for (const f of this.failures) {
      L.push(`### ${f.id} - ${f.name}`, '', `- severity: ${f.severity}`, `- category / subsystem: ${f.category}`, `- seed: ${f.seed ?? 'n/a'}  archetype: ${f.archetype ?? 'n/a'}  scenario: ${f.scenarioId ?? 'n/a'}`, `- expected: ${String(f.expected ?? 'see artifact').slice(0, 300)}`, `- actual: \`${JSON.stringify(f.actual ?? f.detail ?? {}).slice(0, 400)}\``, `- likely cause: ${f.likelyCause || 'not determined automatically'}`, `- occurrences: ${f.count ?? 1}`, `- reproduce: \`${f.reproduce}\``, `- artifact: test-results/longitudinal/failure-${f.id}.md`, '');
    }
    const reviews = this.records.filter((r) => r.status === 'review');
    L.push('## REVIEW cases (need a human decision)', '');
    if (!reviews.length) L.push('None.', '');
    for (const r of reviews) L.push(`- **[${r.category}] [${r.classification || 'UNCLASSIFIED'}]** ${r.name}  \n  \`${JSON.stringify(r.detail).slice(0, 500)}\``);
    L.push('', '## Passing scenario checks', '');
    for (const r of this.records.filter((r) => r.status === 'pass')) L.push(`- [${r.category}] ${r.name}`);
    L.push('', '## How to reproduce', '', '```', `LONGITUDINAL_LEVEL=${meta.level} LONGITUDINAL_SEED=${meta.baseSeed} node tests/longitudinal/run.cjs`, 'node tests/longitudinal/run.cjs --repro <archetype>:<seed>:<weeks>   # prints one user\'s full timeline', '```', '');
    if (extra.dispositions && extra.dispositions.length) {
      L.push('## REVIEW DISPOSITION (the 12 REVIEW items from the first full run)', '');
      L.push('| # | Original review | Classification | Code changed | Regression test |', '|---|---|---|---|---|');
      for (const d of extra.dispositions) L.push('| ' + d.id + ' | ' + d.original + ' | **' + d.classification + '** | ' + d.codeChanged + ' | ' + d.regressionTest + ' |');
      L.push('');
      for (const d of extra.dispositions) L.push('**' + d.id + '. ' + d.classification + '**  ', '- evidence: ' + d.evidence, '- decision: ' + d.decision, '');
    }
    if (extra.sections) for (const [title, lines] of Object.entries(extra.sections)) { L.push('## ' + title, ''); for (const l of lines) L.push('- ' + l); L.push(''); }
    if (extra.notes) L.push('## Notes', '', extra.notes, '');
    return L.join('\n');
  }
}
module.exports = { Reporter, CATEGORY_ORDER };
