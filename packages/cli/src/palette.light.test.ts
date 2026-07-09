import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DARK_PALETTE, paletteFor } from './lanes/claude.js';

test('paletteFor("light") !== paletteFor("dark")', () => {
  assert.notEqual(paletteFor('light'), paletteFor('dark'));
});

test('light palette body-fg fields fall back to undefined (terminal default fg)', () => {
  const light = paletteFor('light');
  assert.equal(light.fg, undefined);
  assert.equal(light.welcome, undefined);
  assert.equal(light.userFg, undefined);
  assert.equal(light.toolLine, undefined);
  assert.equal(light.userBg, undefined);
});

test('light palette accents are unchanged from dark (no fabricated colors)', () => {
  const light = paletteFor('light');
  assert.equal(light.green, DARK_PALETTE.green);
  assert.equal(light.orange, DARK_PALETTE.orange);
  assert.equal(light.thinking, DARK_PALETTE.thinking);
  assert.equal(light.thinkingUltra, DARK_PALETTE.thinkingUltra);
  assert.equal(light.purpleUltra, DARK_PALETTE.purpleUltra);
  assert.equal(light.statusPrimary, DARK_PALETTE.statusPrimary);
  assert.equal(light.divider, DARK_PALETTE.divider);
});

test('paletteFor("dark") and any other/unknown theme value return DARK_PALETTE', () => {
  assert.equal(paletteFor('dark'), DARK_PALETTE);
});
