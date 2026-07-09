import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './bin.js';

// `node --test` stdin is never a TTY, so `run([])` always hits the non-TTY
// gate (bin.tsx L49-52) rather than the render path. This is the P0
// byte-identical contract guard: no alternate-screen escapes leak out when
// stdin isn't interactive.

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = ((chunk: any) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return out;
}

test('run([]) on non-TTY prints exactly "busycode (static)\\n"', async () => {
  const out = await captureStdout(() => run([]));
  assert.equal(out, 'busycode (static)\n'); // byte-identical P0 gate
  assert.ok(!out.includes('\x1b')); // escape 바이트 0
});
