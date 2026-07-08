import React from 'react';
import { render, Box, Text } from 'ink';
import { resolveContext } from './config.js';

export function run(argv: string[] = process.argv.slice(2)): void {
  void argv;

  // Mandatory TTY safety gate: never enter Ink raw-mode outside a real TTY
  // (pipes, CI, non-interactive shells) — raw-mode setup crashes otherwise.
  if (!process.stdin.isTTY) {
    process.stdout.write('busycode (static)\n');
    return;
  }

  const ctx = resolveContext({ argv });

  render(
    <Box flexDirection="column">
      <Text>busycode</Text>
      <Text dimColor>{ctx.statusLine}</Text>
    </Box>,
  );
}

run();
