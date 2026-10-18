// PRNG deterministico (mulberry32) + hash stringa -> seed. Stesso seed = stessa sequenza.
export function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = String(seed);
    this.s = hashSeed(this.seed) || 1;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) {
    if (!arr.length) throw new Error("pick() su array vuoto");
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Estrae n elementi distinti (n clampato alla lunghezza). */
  pickN(arr, n) {
    const a = [...arr];
    const out = [];
    while (out.length < n && a.length) out.push(a.splice(Math.floor(this.next() * a.length), 1)[0]);
    return out;
  }
  shuffle(arr) { return this.pickN(arr, arr.length); }
  /** Rng figlio indipendente: derivare per sezione evita che cambiare una sezione sposti le altre. */
  fork(label) { return new Rng(this.seed + "::" + label); }
}
