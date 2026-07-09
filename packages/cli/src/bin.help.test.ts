import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './bin.js';

// These tests only exercise the early-return argv-intercept path (§6): they
// never reach the TTY gate or the render path. Runtime replay behavior is
// covered by the standalone pty smoke script instead.

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

test('run(["--version"]) prints a semver line and does not render', async () => {
  const out = await captureStdout(() => run(['--version']));
  assert.match(out, /^\d+\.\d+\.\d+\n$/);
  assert.ok(!out.includes('\x1b[?1049h'));
});

test('run(["-v"]) also prints version (short flag)', async () => {
  const out = await captureStdout(() => run(['-v']));
  assert.match(out, /^\d+\.\d+\.\d+\n$/);
  assert.ok(!out.includes('\x1b[?1049h'));
});

test('run(["--help"]) prints usage and is neutral (no real paths)', async () => {
  const out = await captureStdout(() => run(['--help']));
  assert.match(out, /Usage:/);
  assert.match(out, /--infinite\s+Loop the replay until interrupted \(Ctrl\+C\)/);
  assert.doesNotMatch(out, /\/Users\//);
  assert.doesNotMatch(out, /~\/Desktop/);
  assert.ok(!out.includes('\x1b[?1049h'));
});

test('run(["-h"]) also prints usage (short flag)', async () => {
  const out = await captureStdout(() => run(['-h']));
  assert.match(out, /Usage:/);
  assert.ok(!out.includes('\x1b[?1049h'));
});
