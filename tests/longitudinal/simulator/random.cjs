'use strict';
/* Deterministic seeded randomness. Every simulation records its seed. */
function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.seed = seed >>> 0; this.next = mulberry32(this.seed); }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  gauss(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  fork(label) { return new Rng(hashSeed(this.seed, label)); }
}
module.exports = { Rng, hashSeed };
