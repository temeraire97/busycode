import { render } from 'ink';
import { resolveContext } from './config.js';
import { selectLane } from './lanes/index.js';

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  void argv;

  // Mandatory TTY safety gate: never enter Ink raw-mode outside a real TTY
  // (pipes, CI, non-interactive shells) — raw-mode setup crashes otherwise.
  if (!process.stdin.isTTY) {
    process.stdout.write('busycode (static)\n');
    return;
  }

  const ctx = resolveContext({ argv });
  const lane = selectLane('claude'); // P2: single lane fixed
  const instance = render(lane.render(ctx));
  await instance.waitUntilExit(); // drain -> exit() inside the lane -> process exits 0
}

run();
