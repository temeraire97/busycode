import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery, claudeTimeline } from './claude.timeline.js';

test('claudeTimeline has exactly 9 events (H3)', () => {
  assert.equal(claudeTimeline.length, 9);
});

test('claudeTimeline ultra:true is at indices 1, 4, 6 (H3)', () => {
  const ultraIndices = claudeTimeline
    .map((event, index) => (event.ultra ? index : -1))
    .filter((index) => index !== -1);

  assert.deepEqual(ultraIndices, [1, 4, 6]);
});

test('no claudeTimeline title or line contains a leaked absolute-user path', () => {
  // Built via concatenation (not a literal substring) so this assertion
  // string itself never trips the repo-wide leak gate that greps for it.
  const forbidden = '/' + 'Users' + '/';
  for (const event of claudeTimeline) {
    assert(!event.title.includes(forbidden), `title leaks an absolute user path: ${event.title}`);
    for (const line of event.lines) {
      assert(!line.includes(forbidden), `line leaks an absolute user path: ${line}`);
    }
  }
});

test('buildSearchQuery returns the trimmed prompt verbatim when <=18 chars', () => {
  assert.equal(buildSearchQuery('  hello world  '), 'hello world');
});

test('buildSearchQuery truncates to the first 18 chars (no ellipsis) when >18 chars', () => {
  const prompt = 'this prompt is definitely longer than eighteen characters';
  const result = buildSearchQuery(prompt);
  assert.equal(result, prompt.slice(0, 18));
  assert.equal(result.length, 18);
  assert(!result.includes('…'));
});

test('buildSearchQuery trims before measuring length', () => {
  const prompt = '   exactly eighteen   ';
  assert.equal(buildSearchQuery(prompt), 'exactly eighteen');
});
