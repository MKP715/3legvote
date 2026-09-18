/**
 * Cryptographically secure, unbiased random helpers for drawing "from the hat".
 * Uses the Web Crypto API (window.crypto.getRandomValues) with rejection sampling
 * so every candidate has exactly equal probability.
 */

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Secure random numbers are not available in this browser.');
  }
  return c;
}

/** Uniform integer in [0, n). */
export function secureRandomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('n must be a positive integer');
  if (n === 1) return 0;
  const max = 0x100000000; // 2^32
  const limit = max - (max % n); // reject values that would bias the modulo
  const buf = new Uint32Array(1);
  const crypto = getCrypto();
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Fisher–Yates shuffle with secure randomness; returns a new array. */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
