// COPY, not import. This file is a verbatim data copy from the repo-root web
// fake `src/App.tsx` (ClaudeCodeTui). Do NOT `import` from the web app and do
// NOT mutate `src/App.tsx` — the web app and this CLI package are independent
// deployment units. Values below are copied literally (types, constants,
// timeline array, helper functions) with `export` added where App.tsx keeps
// them module-private. See P2 spec §2 for the exact App.tsx line ranges this
// was copied from.

/** Verbatim copy of App.tsx:46-52 (`ClaudeTimelineEvent`). */
export type ClaudeTimelineEvent = {
  title: string;
  duration: number;
  lines: string[];
  statusText: string;
  ultra?: boolean;
};

/** Verbatim copy of App.tsx:54-57 (`ClaudeTranscriptItem`). */
export type ClaudeTranscriptItem =
  | { type: 'user'; text: string }
  | { type: 'tool'; title: string; lines: string[] }
  | { type: 'status'; text: string; hint?: string };

/** Verbatim copy of App.tsx:12 — 4-frame Claude "ultra thinking" spinner. */
export const claudeThinkingFrames = ['✻', '✳', '✢', '·'];

/**
 * Verbatim copy of App.tsx:7 (`workspacePath`), renamed for clarity in this
 * package. Neutral literal only — DATA files must never embed a real
 * filesystem path. Runtime cwd is resolved by the render layer via
 * `ClaudeContext.workspace` (see config.ts), never by mutating this constant.
 */
export const FALLBACK_WORKSPACE = '~/workspace';

/**
 * Verbatim copy of App.tsx:386-478. Exactly 9 events. `ultra: true` at
 * indices 1, 4, 6. Ellipses, box-drawing (`└`) and indentation preserved
 * character-for-character from the source.
 */
export const claudeTimeline: ClaudeTimelineEvent[] = [
  {
    title: 'Explore(Deep codebase exploration)',
    lines: [
      '└ Read(vite.config.ts)',
      '  Bash(find src -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \\) | grep -v node_modules | head…)',
      '  Running…',
      '  +4 more tool uses (ctrl+o to expand)',
    ],
    statusText: 'Symbioting…',
    duration: 3200,
  },
  {
    title: 'Thinking through the codebase architecture… (ctrl+o to expand)',
    lines: [
      '└ aligning transcript flow, tool grouping, and terminal realism',
      '  +3 more thought branches (ctrl+o to expand)',
    ],
    statusText: 'Ultra Thinking…',
    duration: 12000,
    ultra: true,
  },
  {
    title: 'Read(src/App.tsx)',
    lines: [
      '└ Bash(sed -n "1,220p" src/App.tsx)',
      '  Running…',
      '  (ctrl+b to run in background)',
    ],
    statusText: 'Germinating…',
    duration: 2400,
  },
  {
    title: 'Search(useEffect|useLayoutEffect|setInterval in src)',
    lines: [
      '└ Bash(rg "useEffect|useLayoutEffect|setInterval" src)',
      '  Running…',
      '  +2 more tool uses (ctrl+o to expand)',
    ],
    statusText: 'Transfiguring…',
    duration: 5400,
  },
  {
    title: 'Reconciling request intent with repository state… (ctrl+o to expand)',
    lines: [
      '└ evaluating hidden constraints and likely UI revisions',
      '  +5 more thought branches (ctrl+o to expand)',
    ],
    statusText: 'Ultra Thinking…',
    duration: 15000,
    ultra: true,
  },
  {
    title: 'Edit(src/App.tsx)',
    lines: [
      '└ Applied patch (+58 -18)',
      '  Bash(git diff -- src/App.tsx src/App.css)',
      '  Ready for review',
    ],
    statusText: 'Refining…',
    duration: 2600,
  },
  {
    title: 'Simulating likely next edits before acting… (ctrl+o to expand)',
    lines: [
      '└ measuring whether this should become a patch, search, or transcript update',
      '  +2 more thought branches (ctrl+o to expand)',
    ],
    statusText: 'Ultra Thinking…',
    duration: 11000,
    ultra: true,
  },
  {
    title: 'Read(memory/MEMORY.md)',
    lines: [
      '└ Bash(sed -n "1,180p" memory/MEMORY.md)',
      '  Running…',
      '  (ctrl+b to run in background)',
    ],
    statusText: 'Germinating…',
    duration: 2600,
  },
  {
    title: 'Run(pnpm run build)',
    lines: [
      '└ Bash(pnpm run build)',
      '  Running…',
      '  +1 more tool use (ctrl+o to expand)',
    ],
    statusText: 'Transfiguring…',
    duration: 4200,
  },
];

/**
 * Verbatim copy of App.tsx:1016-1023 (`buildSearchQuery`). Pure function:
 * trims the prompt; returns it unchanged if <=18 chars, otherwise the first
 * 18 chars (no ellipsis appended).
 *
 * @internal interactive-only (P3 --interactive). Not used by static replay.
 */
export function buildSearchQuery(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 18) {
    return trimmed;
  }

  return `${trimmed.slice(0, 18)}`;
}

/**
 * Factory mirroring the shape of the synthetic Web Search transcript item
 * built inline at App.tsx:1152-1159 (only ever produced there in response to
 * a *typed* prompt via the Enter handler). `https://search.example` is
 * already a neutral placeholder domain.
 *
 * @internal interactive-only (P3 --interactive). Not used by static replay —
 * the static 9-event `claudeTimeline` above has no Web Search entry, and
 * seeding one here would fabricate a user query that was never typed.
 */
export function makeWebSearchItem(prompt: string): ClaudeTranscriptItem {
  const query = buildSearchQuery(prompt);
  return {
    type: 'tool',
    title: `Web Search("${query}")`,
    lines: [
      `└ Found 10 results for "${query}"`,
      `  Bash(curl -L "https://search.example/?q=${query}")`,
    ],
  };
}
