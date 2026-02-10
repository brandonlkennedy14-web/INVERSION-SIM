// Deterministic PRNG (Mulberry32)
export function makeRng(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, a: number, b: number) {
  return a + Math.floor(rng() * (b - a + 1));
}
