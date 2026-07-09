import { render } from 'ink';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveContext } from './config.js';
import { installErrorSurfacing } from './fullscreen.js';
import { selectLane } from './lanes/index.js';

function readVersion(): string {
  try {
    const url = new URL('../package.json', import.meta.url); // dist/cli.js -> ../package.json (npm always includes package.json)
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const USAGE = `busycode — terminal-native Claude Code session replay

Usage:
  busycode [options]

Options:
  --real            Render the live statusline from your Claude settings (display-only)
  --model <label>   Displayed model label (default: claude-sonnet-4-5 (default))
  --theme <name>    Color theme: dark | light (default: dark)
  --light           Shortcut for --theme light
  --dark            Shortcut for --theme dark
  --infinite        Loop the replay until interrupted (Ctrl+C)
  -v, --version     Print version and exit
  -h, --help        Print this help and exit

Plays a neutral, self-exiting replay of a Claude Code session.
In a non-interactive shell it prints 'busycode (static)' and exits.
`;

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  // argv intercept — BEFORE the TTY gate so `busycode --version` never
  // launches the replay. Neutral text only (no real fs paths).
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  // Mandatory TTY safety gate: never enter Ink raw-mode outside a real TTY
  // (pipes, CI, non-interactive shells) — raw-mode setup crashes otherwise.
  if (!process.stdin.isTTY) {
    process.stdout.write('busycode (static)\n');
    return;
  }

  const ctx = resolveContext({ argv });
  const infinite = argv.includes('--infinite');
  const lane = selectLane('claude'); // P2: single lane fixed
  const instance = render(lane.render(ctx, { infinite }), { alternateScreen: true });
  const disposeErrorSurfacing = installErrorSurfacing(() => instance.unmount());
  try {
    await instance.waitUntilExit(); // drain -> exit() inside the lane -> process exits 0
  } catch (err) {
    // handleAppExit(error) 경로 — unmount는 이미 수행됨(restore 완료 상태)
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`\n${text}\n`);
    process.exitCode = 1;
  } finally {
    disposeErrorSurfacing();
  }
}

// side-effect-free import (M5): only auto-run when invoked as the bin entry,
// not merely by being imported (e.g. `import('busycode')` from a test/host).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  run();
}
