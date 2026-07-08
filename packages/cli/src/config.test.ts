import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveContext, type ResolveIo } from './config.js';

const NEUTRAL_STATUSLINE = '~/workspace · claude-sonnet-4-5 (default) · dark';
// Fixed cwd injected for `--real` cases so `workspace` (and therefore the
// builtin fallback one-liner) is deterministic instead of the actual
// test-runner process cwd.
const FAKE_CWD = '/fake/cwd';
const REAL_BUILTIN_STATUSLINE = `${FAKE_CWD} · claude-sonnet-4-5 (default) · dark`;

function fakeStat(overrides: Partial<{ isFile: boolean; size: number }> = {}) {
  const { isFile = true, size = 100 } = overrides;
  return () => ({ isFile: () => isFile, size });
}

test('1. no-config / neutral: real:false yields builtin one-liner, no throw', () => {
  const ctx = resolveContext({ argv: [], env: {} });
  assert.equal(ctx.statusLine, NEUTRAL_STATUSLINE);
});

test('2. real + valid command: renderStatusLine stub is used verbatim', () => {
  const settings = JSON.stringify({ statusLine: { type: 'command', command: 'echo hi' } });
  const io: ResolveIo = {
    argv: ['--real'],
    env: { HOME: '/home/u' } as any,
    homedir: () => '/home/u',
    statSync: fakeStat(),
    readFileSync: () => settings,
    renderStatusLine: () => 'HELLO',
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, 'HELLO');
});

test('3. real + render null falls back to builtinOneLiner', () => {
  const settings = JSON.stringify({ statusLine: { type: 'command', command: 'echo hi' } });
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    statSync: fakeStat(),
    readFileSync: () => settings,
    renderStatusLine: () => null,
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, `${ctx.workspace} · ${ctx.model} · ${ctx.theme}`);
});

test('4. malformed JSON does not throw, falls back to builtin', () => {
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    cwd: () => FAKE_CWD,
    statSync: fakeStat(),
    readFileSync: () => 'not json{',
  };
  assert.doesNotThrow(() => {
    const ctx = resolveContext(io);
    assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
  });
});

test("5. JSON 'null' / '42' / '{}' all degrade to builtin without throwing", () => {
  for (const raw of ['null', '42', '{}']) {
    const io: ResolveIo = {
      argv: ['--real'],
      env: {} as any,
      homedir: () => '/home/u',
      cwd: () => FAKE_CWD,
      statSync: fakeStat(),
      readFileSync: () => raw,
    };
    assert.doesNotThrow(() => {
      const ctx = resolveContext(io);
      assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
    });
  }
});

test('6. missing statusLine key / wrong type / non-string command => builtin, renderStatusLine not called', () => {
  const variants = [
    JSON.stringify({ other: true }),
    JSON.stringify({ statusLine: { type: 'not-command', command: 'echo hi' } }),
    JSON.stringify({ statusLine: { type: 'command', command: 42 } }),
  ];
  for (const raw of variants) {
    let called = false;
    const io: ResolveIo = {
      argv: ['--real'],
      env: {} as any,
      homedir: () => '/home/u',
      cwd: () => FAKE_CWD,
      statSync: fakeStat(),
      readFileSync: () => raw,
      renderStatusLine: () => {
        called = true;
        return 'SHOULD_NOT_HAPPEN';
      },
    };
    const ctx = resolveContext(io);
    assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
    assert.equal(called, false);
  }
});

test('7. missing file (statSync throws ENOENT) => builtin', () => {
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    cwd: () => FAKE_CWD,
    statSync: () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
});

test('8. FIFO (isFile()===false) => builtin, readFileSync not called', () => {
  let readCalled = false;
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    cwd: () => FAKE_CWD,
    statSync: fakeStat({ isFile: false }),
    readFileSync: () => {
      readCalled = true;
      return '{}';
    },
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
  assert.equal(readCalled, false);
});

test('9. size cap exceeded => builtin, readFileSync not called', () => {
  let readCalled = false;
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    cwd: () => FAKE_CWD,
    statSync: fakeStat({ size: 300 * 1024 }),
    readFileSync: () => {
      readCalled = true;
      return '{}';
    },
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, REAL_BUILTIN_STATUSLINE);
  assert.equal(readCalled, false);
});

test('10. never touches ~/.claude.json path', () => {
  const seenPaths: string[] = [];
  const home = '/home/u';
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => home,
    statSync: (p: string) => {
      seenPaths.push(p);
      return { isFile: () => true, size: 100 };
    },
    readFileSync: (p: string) => {
      seenPaths.push(p);
      return JSON.stringify({ statusLine: { type: 'command', command: 'echo hi' } });
    },
    renderStatusLine: () => 'X',
  };
  resolveContext(io);
  const claudeJsonPath = path.join(home, '.claude.json');
  for (const p of seenPaths) {
    assert.equal(p.endsWith('.claude.json'), false);
    assert.notEqual(p, claudeJsonPath);
  }
});

test('11. neutrality: real:false context has no identity/session leakage', () => {
  const ctx = resolveContext({ argv: [], env: {} });
  const json = JSON.stringify(ctx);
  for (const needle of ['/home/', '@', 'oauth']) {
    assert.equal(json.includes(needle), false);
  }
});

test('12. argv model parsing', () => {
  assert.equal(resolveContext({ argv: ['--model'], env: {} }).model, 'claude-sonnet-4-5 (default)');
  const ctx2 = resolveContext({ argv: ['--model', '--real'], env: {} });
  assert.equal(ctx2.model, 'claude-sonnet-4-5 (default)');
  assert.equal(resolveContext({ argv: ['--model=x'], env: {} }).model, 'x');
  assert.equal(resolveContext({ argv: ['--model', 'x'], env: {} }).model, 'x');
});

test('13. theme clamp', () => {
  assert.equal(resolveContext({ argv: [], env: { BUSYCODE_THEME: 'blue' } as any }).theme, 'dark');
  assert.equal(resolveContext({ argv: ['--theme', 'purple'], env: {} }).theme, 'dark');
  assert.equal(resolveContext({ argv: ['--light'], env: {} }).theme, 'light');
  assert.equal(resolveContext({ argv: ['--dark'], env: {} }).theme, 'dark');
});

test('14. real strict: BUSYCODE_REAL=0 => 0 disk reads; BUSYCODE_REAL=1 => attempts read', () => {
  let statCalled = false;
  const ioOff: ResolveIo = {
    argv: [],
    env: { BUSYCODE_REAL: '0' } as any,
    homedir: () => '/home/u',
    statSync: () => {
      statCalled = true;
      return { isFile: () => true, size: 1 };
    },
  };
  resolveContext(ioOff);
  assert.equal(statCalled, false);

  let statCalled2 = false;
  const ioOn: ResolveIo = {
    argv: [],
    env: { BUSYCODE_REAL: '1' } as any,
    homedir: () => '/home/u',
    statSync: () => {
      statCalled2 = true;
      throw new Error('ENOENT');
    },
  };
  resolveContext(ioOn);
  assert.equal(statCalled2, true);
});

test('15. empty-HOME: no disk read, no repo-local resolution', () => {
  let readCalled = false;
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '',
    cwd: () => '/some/repo',
    statSync: () => ({ isFile: () => true, size: 1 }),
    readFileSync: () => {
      readCalled = true;
      return '{}';
    },
  };
  const ctx = resolveContext(io);
  assert.equal(ctx.statusLine, `${ctx.workspace} · claude-sonnet-4-5 (default) · dark`);
  assert.equal(readCalled, false);
});

test('16. empty env values fall back: ANTHROPIC_MODEL="" => default; CLAUDE_CONFIG_DIR="" => home fallback', () => {
  const ctx = resolveContext({ argv: [], env: { ANTHROPIC_MODEL: '' } as any });
  assert.equal(ctx.model, 'claude-sonnet-4-5 (default)');

  let statPath = '';
  const io: ResolveIo = {
    argv: ['--real'],
    env: { CLAUDE_CONFIG_DIR: '' } as any,
    homedir: () => '/home/u',
    statSync: (p: string) => {
      statPath = p;
      throw new Error('ENOENT');
    },
  };
  resolveContext(io);
  assert.equal(statPath, path.join('/home/u', '.claude', 'settings.json'));
});

test('17. builtin composition reflects resolved fields, not a static literal', () => {
  const ctx = resolveContext({ argv: ['--light', '--model', 'claude-opus-4'], env: {} });
  assert.equal(ctx.statusLine, '~/workspace · claude-opus-4 · light');
});

test('18. cwd throw is defended: workspace falls back, no throw', () => {
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    cwd: () => {
      throw new Error('uv_cwd failed');
    },
  };
  assert.doesNotThrow(() => {
    const ctx = resolveContext(io);
    assert.equal(ctx.workspace, '~/workspace');
  });
});

test('19. payload shape: model is object, top-level cwd present, workspace.current_dir present, no theme/version keys', () => {
  const settings = JSON.stringify({ statusLine: { type: 'command', command: 'echo hi' } });
  let capturedPayload: any;
  const io: ResolveIo = {
    argv: ['--real'],
    env: {} as any,
    homedir: () => '/home/u',
    cwd: () => '/repo/dir',
    statSync: fakeStat(),
    readFileSync: () => settings,
    renderStatusLine: (_command, payload) => {
      capturedPayload = payload;
      return 'OK';
    },
  };
  resolveContext(io);
  assert.equal(typeof capturedPayload.model, 'object');
  assert.equal(capturedPayload.model.id, 'claude-sonnet-4-5 (default)');
  assert.equal(capturedPayload.model.display_name, 'claude-sonnet-4-5 (default)');
  assert.equal(capturedPayload.cwd, '/repo/dir');
  assert.equal(capturedPayload.workspace.current_dir, '/repo/dir');
  assert.equal('theme' in capturedPayload, false);
  assert.equal('version' in capturedPayload, false);
});
