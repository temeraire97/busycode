import React from 'react';
import { render, Box, Text } from 'ink';

export function run(argv: string[] = process.argv.slice(2)): void {
  void argv;

  // Mandatory TTY safety gate: never enter Ink raw-mode outside a real TTY
  // (pipes, CI, non-interactive shells) — raw-mode setup crashes otherwise.
  if (!process.stdin.isTTY) {
    process.stdout.write('busycode (static)\n');
    return;
  }

  render(
    <Box>
      <Text>busycode</Text>
    </Box>,
  );
}

run();
