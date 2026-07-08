import { spawnSync } from 'node:child_process';

export interface StatusLinePayload {
  hook_event_name: 'Status';
  session_id: string;
  cwd: string;
  model: { id: string; display_name: string };
  workspace: { current_dir: string; project_dir: string };
}

type SpawnSyncFn = typeof spawnSync;

/**
 * Strip escape sequences from child-process stdout before it ever reaches
 * the Ink renderer. Keeps printable text, \t/\n, and SGR color sequences
 * (ESC[...m). Strips OSC/DCS/APC/PM/SOS terminators, all non-SGR CSI
 * (cursor movement, screen clear, etc.), C1 controls, and any stray ESC.
 *
 * This is intentionally stricter than real Claude Code's verbatim
 * passthrough — it closes the escape-injection vector (OSC 52 clipboard
 * theft, cursor/alt-screen spoofing) for untrusted statusLine commands.
 */
// Private-use sentinel used to shield the ESC byte of a *kept* SGR sequence
// from the later blanket C0/stray-ESC strip passes below. It cannot appear
// in real terminal input, and is restored to ESC as the final step.
const SGR_ESC_SENTINEL = '';

export function sanitizeStatusLine(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC ... BEL/ST
    .replace(/\x1b[P^_X][\s\S]*?(?:\x1b\\|\x07)/g, '') // DCS/APC/PM/SOS ... ST
    .replace(/\x1b\[[0-9;:<=>?]*[ -/]*([@-~])/g, (m, final) =>
      final === 'm' ? m.replace(/\x1b/, SGR_ESC_SENTINEL) : '',
    ) // keep SGR (ESC shielded by sentinel), drop other CSI
    .replace(/[\x80-\x9f]/g, '') // C1 controls
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '') // C0 except \t(09) \n(0a)
    .replace(/\x1b/g, '') // stray ESC
    .split(SGR_ESC_SENTINEL)
    .join('\x1b'); // restore preserved SGR ESC
}

/**
 * Executes a user-owned statusLine command with the given payload piped to
 * stdin (the only untrusted-data channel — never interpolated into the
 * command string). Returns sanitized stdout on success, or null on any
 * failure/degradation path. Never throws.
 *
 * `spawn` is injectable (3rd param) purely for unit-test seams; production
 * callers always get the real `spawnSync` default.
 */
export function renderStatusLine(
  command: string,
  payload: StatusLinePayload,
  spawn: SpawnSyncFn = spawnSync,
): string | null {
  let r: ReturnType<SpawnSyncFn>;
  try {
    r = spawn(command, {
      shell: true,
      input: JSON.stringify(payload),
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return null;
  }

  // status-first predicate: never deref stdout on a failure path
  // (spawn-fail gives stdout === undefined).
  if (r.error != null) return null;
  if (r.signal != null) return null;
  if (r.status !== 0) return null;
  const buf = r.stdout;
  if (!buf || buf.length === 0) return null;

  const cleaned = buf.toString('utf8').trimEnd();
  if (cleaned.length === 0) return null;
  return sanitizeStatusLine(cleaned);
}
