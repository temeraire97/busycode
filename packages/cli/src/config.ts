import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { renderStatusLine as realRender } from './statusline.js';
import type { StatusLinePayload } from './statusline.js';

export interface ClaudeContext {
  workspace: string; // real: cwd, neutral: '~/workspace'
  model: string; // display label, e.g. 'claude-sonnet-4-5 (default)'
  theme: 'dark' | 'light';
  statusLine: string; // ALWAYS a string — never null
}

export interface ResolveIo {
  argv?: string[]; // default process.argv.slice(2)
  env?: NodeJS.ProcessEnv; // default process.env
  homedir?: () => string; // default os.homedir
  cwd?: () => string; // default process.cwd
  statSync?: (p: string) => { isFile(): boolean; size: number }; // default fs.statSync
  readFileSync?: (p: string, enc: 'utf8') => string; // default fs.readFileSync
  renderStatusLine?: (command: string, payload: StatusLinePayload) => string | null; // default realRender
}

/**
 * argv value-flag helper. Never throws; unknown/dangling flags degrade to
 * `undefined` rather than swallowing a following `--token`.
 */
function takeValue(argv: string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === flag) {
      const next = argv[i + 1];
      return next !== undefined && !next.startsWith('--') ? next : undefined;
    }
    if (tok.startsWith(flag + '=')) return tok.slice(flag.length + 1);
  }
  return undefined;
}

/**
 * Resolves the simulated Claude Code context. Total function — never
 * throws on any input. All disk/exec/cwd/homedir access is guarded.
 */
export function resolveContext(io: ResolveIo = {}): ClaudeContext {
  const argv = io.argv ?? process.argv.slice(2);
  const env = io.env ?? process.env;
  const real = argv.includes('--real') || env.BUSYCODE_REAL === '1'; // strict '1'

  // model — never read ~/.claude.json, never reverse-parse statusLine stdout
  const flagModel = takeValue(argv, '--model');
  const envModel = env.ANTHROPIC_MODEL?.trim() || undefined; // '' => absent
  const model = flagModel || envModel || 'claude-sonnet-4-5 (default)';

  // theme — union clamp
  const flagTheme = argv.includes('--light')
    ? 'light'
    : argv.includes('--dark')
      ? 'dark'
      : takeValue(argv, '--theme');
  const tEnv = env.BUSYCODE_THEME?.trim() || undefined; // '' => absent
  const tRaw = flagTheme ?? tEnv;
  const theme: 'dark' | 'light' = tRaw === 'light' || tRaw === 'dark' ? tRaw : 'dark';

  // workspace — injected cwd, throw-defended
  function safeCwd(): string {
    try {
      return (io.cwd ?? process.cwd)();
    } catch {
      return '~/workspace';
    }
  }
  const workspace = real ? safeCwd() : '~/workspace';

  // configDir — absolute-HOME guard; NO XDG
  function safeHome(): string {
    try {
      return (io.homedir ?? os.homedir)() ?? '';
    } catch {
      return '';
    }
  }
  const envDir = env.CLAUDE_CONFIG_DIR?.trim();
  const home = safeHome();
  const configDir: string | null = envDir
    ? envDir
    : home && path.isAbsolute(home)
      ? path.join(home, '.claude')
      : null;

  const builtinOneLiner = () => `${workspace} · ${model} · ${theme}`;

  function buildPayload(modelLabel: string, cwd: string): StatusLinePayload {
    return {
      hook_event_name: 'Status',
      session_id: 'busycode', // synthetic stable — no live session data mirrored
      cwd, // top-level (git-branch line depends on this)
      model: { id: modelLabel, display_name: modelLabel }, // OBJECT, not flat string
      workspace: { current_dir: cwd, project_dir: cwd },
    };
  }

  function readAndRender(): string | null {
    if (!real || configDir == null) return null;
    try {
      const file = path.join(configDir, 'settings.json'); // path.join, never '+/'
      const st = (io.statSync ?? fs.statSync)(file);
      if (!st.isFile() || st.size > 256 * 1024) return null; // FIFO/huge/dev-zero guard
      const raw = (io.readFileSync ?? fs.readFileSync)(file, 'utf8');
      const parsed: unknown = JSON.parse(raw); // read + parse in ONE try
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as any).statusLine?.type === 'command' &&
        typeof (parsed as any).statusLine.command === 'string'
      ) {
        const command: string = (parsed as any).statusLine.command;
        return (io.renderStatusLine ?? realRender)(command, buildPayload(model, workspace));
      }
      return null;
    } catch {
      return null;
    }
  }

  const statusLine = readAndRender() ?? builtinOneLiner(); // NEVER null
  return { workspace, model, theme, statusLine };
}
