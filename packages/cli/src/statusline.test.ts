import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStatusLine, sanitizeStatusLine, type StatusLinePayload } from './statusline.js';

const payload: StatusLinePayload = {
  hook_event_name: 'Status',
  session_id: 'busycode',
  cwd: '/tmp/project',
  model: { id: 'claude-sonnet-4-5 (default)', display_name: 'claude-sonnet-4-5 (default)' },
  workspace: { current_dir: '/tmp/project', project_dir: '/tmp/project' },
};

function fakeSpawn(result: Partial<ReturnType<typeof import('node:child_process').spawnSync>>) {
  return (() => result as any) as typeof import('node:child_process').spawnSync;
}

test('renderStatusLine: success returns trimmed stdout', () => {
  const spawn = fakeSpawn({ status: 0, stdout: Buffer.from('x'), signal: null, error: null } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), 'x');
});

test('renderStatusLine: non-zero status returns null', () => {
  const spawn = fakeSpawn({ status: 1 } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: empty stdout returns null', () => {
  const spawn = fakeSpawn({ status: 0, stdout: Buffer.from('') } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: whitespace-only stdout returns null', () => {
  const spawn = fakeSpawn({ status: 0, stdout: Buffer.from('   \n') } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: timeout (SIGTERM) returns null', () => {
  const spawn = fakeSpawn({
    error: new Error('ETIMEDOUT'),
    status: null,
    signal: 'SIGTERM',
  } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: shell-fail (stdout undefined) returns null without throwing', () => {
  const spawn = fakeSpawn({
    error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    status: null,
    stdout: undefined,
  } as any);
  assert.doesNotThrow(() => {
    assert.equal(renderStatusLine('cmd', payload, spawn), null);
  });
});

test('renderStatusLine: ENOBUFS with truncated buffer returns null', () => {
  const spawn = fakeSpawn({
    error: Object.assign(new Error('ENOBUFS'), { code: 'ENOBUFS' }),
    status: null,
    stdout: Buffer.from('partial-frag'),
  } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: status 127 (command not found) returns null', () => {
  const spawn = fakeSpawn({ status: 127, stdout: Buffer.from('') } as any);
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('renderStatusLine: synchronous throw from spawn returns null', () => {
  const spawn = (() => {
    throw new Error('boom');
  }) as unknown as typeof import('node:child_process').spawnSync;
  assert.equal(renderStatusLine('cmd', payload, spawn), null);
});

test('sanitizeStatusLine: keeps SGR color sequences', () => {
  const input = '\x1b[32mgreen\x1b[0m';
  assert.equal(sanitizeStatusLine(input), '\x1b[32mgreen\x1b[0m');
});

test('sanitizeStatusLine: strips OSC 52 clipboard sequence', () => {
  const input = 'before\x1b]52;c;ZGF0YQ==\x07after';
  assert.equal(sanitizeStatusLine(input), 'beforeafter');
});

test('sanitizeStatusLine: strips non-SGR CSI (cursor movement)', () => {
  const input = 'before\x1b[2J\x1b[H after';
  assert.equal(sanitizeStatusLine(input), 'before after');
});

test('sanitizeStatusLine: strips DCS sequences', () => {
  const input = 'before\x1bPq#0;2;0;0;0#1;2;100;100;100\x1b\\after';
  assert.equal(sanitizeStatusLine(input), 'beforeafter');
});

test('sanitizeStatusLine: strips C1 controls', () => {
  const input = 'before\x9bafter';
  assert.equal(sanitizeStatusLine(input), 'beforeafter');
});

test('sanitizeStatusLine: preserves newlines and tabs', () => {
  const input = 'line1\nline2\tindented';
  assert.equal(sanitizeStatusLine(input), 'line1\nline2\tindented');
});

test('renderStatusLine: spawn options are correct (timeout, maxBuffer, shell, stdin payload shape)', () => {
  let captured: any;
  const spawn = ((_cmd: string, opts: any) => {
    captured = opts;
    return { status: 0, stdout: Buffer.from('ok'), signal: null, error: null } as any;
  }) as typeof import('node:child_process').spawnSync;

  renderStatusLine('cmd', payload, spawn);

  assert.equal(captured.timeout, 5000);
  assert.equal(captured.maxBuffer, 1048576);
  assert.equal(captured.shell, true);
  const parsedInput = JSON.parse(captured.input);
  assert.equal(typeof parsedInput.model, 'object');
  assert.equal(parsedInput.model.id, payload.model.id);
});
