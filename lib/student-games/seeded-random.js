export function createSeededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed || "mathclaw")) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }

  return function seededRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
