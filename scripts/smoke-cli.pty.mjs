#!/usr/bin/env node
// Standalone runtime smoke test (M1 regression guard) — NOT part of the
// `node --test` fast lane (pty flakiness + full ~60s replay wall time are
// isolated here on purpose). Run directly:
//
//   node scripts/smoke-cli.pty.mjs
//
// Spawns the built `packages/cli/dist/cli.js` under a real pseudo-tty (via a
// tiny python3 `pty.fork()` harness — Node has no built-in pty allocator)
// and asserts that the static replay actually plays: the scheduler/spinner
// timers must stay ref'd (M1) so the event loop survives long enough for the
// spinner to tick (ESC[2K line-clears) and the 9-event timeline to render
// and drain, instead of exiting after the first ~0.5s paint.
//
// Cadence is the *original* 60s timeline (no REPLAY_SCALE) — see P3 user
// override. Default timeout is generous (75s) to cover the full drain.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = process.argv[2] ?? path.join(here, '..', 'packages', 'cli', 'dist', 'cli.js');
const timeoutSec = Number(process.env.SMOKE_TIMEOUT_S ?? 75);

// A minimal pty harness: fork a pty, exec `node <cliPath>` on the slave side,
// read from the master fd until the child exits or the deadline hits, then
// emit one JSON line describing what was observed. Kept intentionally small
// and dependency-free (stdlib only).
const pyHarness = `
import errno, fcntl, json, os, pty, select, signal, struct, sys, termios, time

cli_path = sys.argv[1]
timeout_s = float(sys.argv[2])

pid, fd = pty.fork()
if pid == 0:
    os.execvp('node', ['node', cli_path])
    os._exit(1)

try:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 100, 0, 0))
except Exception:
    pass

start = time.time()
buf = b''
exited = False
exit_code = None

while True:
    remaining = timeout_s - (time.time() - start)
    if remaining <= 0:
        break
    try:
        ready, _, _ = select.select([fd], [], [], min(1.0, remaining))
    except Exception:
        break
    if fd in ready:
        try:
            chunk = os.read(fd, 65536)
        except OSError as e:
            if e.errno == errno.EIO:
                chunk = b''
            else:
                raise
        if not chunk:
            # EOF on the pty master: the child closed its slave fd, which
            # means it has exited (or is exiting right now) — reap it with a
            # blocking waitpid instead of assuming WNOHANG will still see it
            # on a later loop iteration that never comes.
            try:
                wpid, status = os.waitpid(pid, 0)
                if wpid == pid:
                    exited = True
                    exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -1
            except ChildProcessError:
                pass
            break
        buf += chunk
    wpid, status = os.waitpid(pid, os.WNOHANG)
    if wpid == pid:
        exited = True
        exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -1
        break

wall_ms = int((time.time() - start) * 1000)

if not exited:
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass

text = buf.decode('utf-8', errors='replace')
result = {
    'exited': exited,
    'exitCode': exit_code,
    'wallMs': wall_ms,
    'escClearCount': text.count('\\x1b[2K'),
    'hasExplore': 'Explore(Deep codebase exploration)' in text,
    'hasRunBuild': 'Run(pnpm run build)' in text,
    'byteLength': len(buf),
}
print('SMOKE_RESULT:' + json.dumps(result))
`;

const proc = spawnSync('python3', ['-c', pyHarness, cliPath, String(timeoutSec)], {
  encoding: 'utf8',
  timeout: (timeoutSec + 15) * 1000,
});

if (proc.error) {
  console.error('smoke-cli.pty: failed to spawn python3 pty harness:', proc.error);
  process.exit(1);
}

const stdout = proc.stdout ?? '';
const resultLine = stdout.split('\n').find((line) => line.startsWith('SMOKE_RESULT:'));

if (!resultLine) {
  console.error('smoke-cli.pty: no SMOKE_RESULT from harness.');
  console.error('--- harness stdout ---\n' + stdout);
  console.error('--- harness stderr ---\n' + (proc.stderr ?? ''));
  process.exit(1);
}

const result = JSON.parse(resultLine.slice('SMOKE_RESULT:'.length));
console.log('smoke-cli.pty observed:', result);

const failures = [];
if (result.escClearCount <= 0) failures.push('expected ESC[2K line-clears > 0 (spinner never ticked — M1 regression)');
if (!result.hasExplore) failures.push('expected "Explore(Deep codebase exploration)" (first event) to render');
if (!result.hasRunBuild) failures.push('expected "Run(pnpm run build)" (final event) to render — replay did not drain');
if (!result.exited) failures.push(`process did not exit within ${timeoutSec}s (possible hang / orphan risk)`);
if (result.exited && result.exitCode !== 0) failures.push(`process exited with code ${result.exitCode}, expected 0`);

if (failures.length > 0) {
  console.error('smoke-cli.pty FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}

console.log(`smoke-cli.pty PASSED in ${result.wallMs}ms (exit 0, spinner ticked, full 9-event replay drained)`);
process.exit(0);
