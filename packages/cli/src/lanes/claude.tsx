import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useWindowSize } from 'ink';
import {
  claudeThinkingFrames,
  claudeTimeline,
  FALLBACK_WORKSPACE,
  type ClaudeTimelineEvent,
  type ClaudeTranscriptItem,
} from './claude.timeline.js';
import type { ClaudeContext } from '../config.js';

// ---------------------------------------------------------------------------
// palette (theme-keyed, B1/B2) — colors sourced from `src/App.css` for the
// `.claude-*` rules. `paletteFor` is the ONLY place hex literals live; the
// rest of this file always goes through `p.<name>`, never an inline hex.
// ---------------------------------------------------------------------------

export interface ClaudePalette {
  green: string; // shell '›' prompt
  fg: string | undefined; // default tool title/icon + welcome-card meta text
  purpleUltra: string; // ultra tool title/icon (title.includes('Thinking'))
  toolLine: string | undefined; // tool detail lines, welcome-card meta/path/copy
  thinking: string; // active thinking line (non-ultra)
  thinkingUltra: string; // active thinking line (activeStep.ultra)
  orange: string; // card border, section titles, inner divider
  welcome: string | undefined; // welcome heading, composer prompt, /init inline
  userBg: string | undefined; // user line full-bleed background approximation
  userFg: string | undefined; // user line foreground
  statusPrimary: string; // bottom status row (ctx.statusLine)
  divider: string; // horizontal dividers
}

export const DARK_PALETTE: ClaudePalette = {
  green: '#7ef39b',
  fg: '#ece8e3',
  purpleUltra: '#d9b8ff',
  toolLine: '#b8b4b0',
  thinking: '#d05b62',
  thinkingUltra: '#ff8aa1',
  orange: '#e07d58',
  welcome: '#f2efea',
  userBg: '#4a4a4f',
  userFg: '#ece8e3',
  statusPrimary: '#f0c900',
  divider: '#86827d',
};

/**
 * The web fake (`src/App.tsx` + `App.css`) only ever defines a *dark*
 * palette — there is no light-theme CSS to port faithfully. Rather than
 * fabricating unverified light-mode hex values, the near-white body-fg
 * fields fall back to `undefined` so Ink inherits the terminal's own
 * default foreground (legible on a light background). Accent hues
 * (green/orange/thinking/thinkingUltra/purpleUltra/statusPrimary/divider)
 * are kept identical to DARK_PALETTE — those are verified against
 * `App.css` and theme-independent.
 */
export const LIGHT_PALETTE: ClaudePalette = {
  ...DARK_PALETTE,
  fg: undefined, // inherit terminal default fg
  welcome: undefined,
  userFg: undefined,
  toolLine: undefined,
  userBg: undefined, // avoid a dark highlight block on a light background
};

export function paletteFor(theme: ClaudeContext['theme']): ClaudePalette {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

// ---------------------------------------------------------------------------
// small render helpers
// ---------------------------------------------------------------------------

function padToWidth(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// ---------------------------------------------------------------------------
// measured/computed last-N windowing (spec §3.2 conditional fallback) —
// pty smoke observed a real rendering artifact from Ink's overflow-clip
// (`overflowY="hidden"` + `justifyContent="flex-end"` with content taller
// than the container): garbled/overlapping lines and the newest card
// dropped from view entirely. Rather than let the transcript window
// intentionally overflow and rely on Ink's clip, this computes exactly how
// many trailing items fit within the vertical budget and only mounts those
// — so the container's content never actually exceeds its height, and
// Ink's row-level diff writer never hits the negative-offset clip path
// that produced the corruption. `overflowY="hidden"` stays on as a
// defensive backstop only, not the primary mechanism.
// ---------------------------------------------------------------------------

function wrapRows(text: string, innerWidth: number): number {
  if (innerWidth <= 0) return 1;
  return Math.max(1, Math.ceil(text.length / innerWidth));
}

function transcriptItemRows(item: ClaudeTranscriptItem, width: number): number {
  if (item.type === 'user') {
    return wrapRows(padToWidth(`❯ ${item.text}`, width), width) + 1; // + marginBottom
  }
  if (item.type === 'tool') {
    const titleRows = wrapRows(`⏺ ${item.title}`, width);
    const lineRows = item.lines.reduce((sum, line) => sum + wrapRows(line, width), 0);
    return titleRows + lineRows + 1; // + marginBottom
  }
  const textRows = wrapRows(`✻ ${item.text}`, width);
  const hintRows = item.hint ? wrapRows(`  └ ${item.hint}`, width) : 0;
  return textRows + hintRows + 1; // + marginBottom
}

function activeStepRows(event: ClaudeTimelineEvent, width: number): number {
  const titleRows = wrapRows(`⏺ ${event.title}`, width);
  const lineRows = event.lines.reduce((sum, line) => sum + wrapRows(line, width), 0);
  // status line no longer renders inside the transcript card — it's pinned
  // in the bottom chrome (see bottomChromeRows' +1 below).
  return titleRows + lineRows + 1; // + marginBottom
}

function TranscriptCard({
  item,
  palette,
  width,
}: {
  item: ClaudeTranscriptItem;
  palette: ClaudePalette;
  width: number;
}) {
  if (item.type === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text backgroundColor={palette.userBg} color={palette.userFg}>
          {padToWidth(`❯ ${item.text}`, width)}
        </Text>
      </Box>
    );
  }

  if (item.type === 'tool') {
    // Title-based ultra path — deliberately separate from the
    // `activeStep.ultra` flag path used by the dynamic thinking line below
    // (spec §3.2: the two ultra signals diverge on purpose).
    const ultra = item.title.includes('Thinking');
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={ultra ? palette.purpleUltra : palette.fg}>
          <Text color={ultra ? palette.purpleUltra : palette.fg}>⏺</Text> {item.title}
        </Text>
        {item.lines.map((line, lineIndex) => (
          <Text key={lineIndex} color={palette.toolLine}>
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={palette.thinking}>✻ {item.text}</Text>
      {item.hint ? <Text color={palette.toolLine}>  └ {item.hint}</Text> : null}
    </Box>
  );
}

function ActiveToolCard({ event, palette }: { event: ClaudeTimelineEvent; palette: ClaudePalette }) {
  const titleUltra = event.title.includes('Thinking');
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={titleUltra ? palette.purpleUltra : palette.fg}>
        <Text color={titleUltra ? palette.purpleUltra : palette.fg}>⏺</Text> {event.title}
      </Text>
      {event.lines.map((line, lineIndex) => (
        <Text key={lineIndex} color={palette.toolLine}>
          {line}
        </Text>
      ))}
      {/* status/spinner line moved to the pinned bottom-chrome status row —
          it no longer scrolls with the transcript (spec: pin above composer) */}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ClaudeLane
// ---------------------------------------------------------------------------

export function ClaudeLane({ ctx, infinite = false }: { ctx: ClaudeContext; infinite?: boolean }) {
  const palette = paletteFor(ctx.theme);
  const { exit } = useApp();
  const { columns, rows } = useWindowSize(); // 80x24 fallback 내장, resize 시 re-render
  const width = columns; // 결정 B: full width — min(...,100) cap 제거
  const leftWidth = Math.min(46, Math.max(24, Math.floor(width * 0.36)));
  const tipsWidth = Math.max(width - leftWidth - 4, 1);

  // Auto-play on mount — static replay has no typed prompt / Enter step.
  const hasStarted = true;
  const [isRunning, setIsRunning] = useState(true);

  const [finalized, setFinalized] = useState<ClaudeTranscriptItem[]>([]); // append-only (B4)
  const [activeStep, setActiveStep] = useState<ClaudeTimelineEvent | null>(null);
  const [frame, setFrame] = useState(0);

  const timelineIndexRef = useRef(0);
  const activeStepRef = useRef<ClaudeTimelineEvent | null>(null);

  // FIFO memory guard (Fix 2): `finalized` is append-only across cycles in
  // `--infinite` mode (no more bulk setFinalized([]) at cycle boundaries —
  // that produced a full blank-screen flash). Instead every append caps the
  // STATE array to the last FINALIZED_CAP items so it never grows
  // unboundedly across repeated cycles. <Static> is gone, so slicing state
  // is safe — the visible windowing below only ever shows a handful of
  // these anyway, so a 30-item cap is generous headroom.
  const FINALIZED_CAP = 30;

  // -- timeline player (B3 bounded index / B4 append-only / B5 commit-on-advance / H1 timers) --
  useEffect(() => {
    if (!hasStarted || !isRunning) return undefined;

    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = (delay: number) => {
      timer = setTimeout(() => {
        const idx = timelineIndexRef.current;

        // commit-on-advance (B5): the card that was in the dynamic tail is
        // finalized into Static ONLY now, on the next event firing (or at
        // drain below) — never present in both Static and tail at once.
        if (activeStepRef.current) {
          const done = activeStepRef.current;
          setFinalized((cur) => {
            const next = [...cur, { type: 'tool' as const, title: done.title, lines: done.lines }];
            return next.length > FINALIZED_CAP ? next.slice(next.length - FINALIZED_CAP) : next;
          });
        }

        if (idx >= claudeTimeline.length) {
          // DRAIN — bounded index replaces the web fake's infinite
          // `idx % claudeTimeline.length` loop (B3), unless `--infinite`
          // asks for exactly that behavior back.
          setActiveStep(null);
          activeStepRef.current = null;

          if (infinite) {
            // reset for a new cycle: rewind the bounded index and keep the
            // scheduler running — isRunning never flips false, so the
            // settle-exit effect below never fires in infinite mode. NO
            // bulk clear here (Fix 2) — cycle 2's cards keep appending onto
            // the same `finalized` array (capped above) so the replay scrolls
            // seamlessly like a real terminal instead of blinking empty. A
            // brief idle beat (composer-only screen) between cycles mirrors
            // the initial 400ms lead-in.
            timelineIndexRef.current = 0;
            scheduleNext(1200); // idle beat, then next cycle's lead-in
            return;
          }

          setIsRunning(false); // triggers cleanup of both timer effects
          return;
        }

        const nextEvent = claudeTimeline[idx];
        timelineIndexRef.current = idx + 1;
        setActiveStep(nextEvent);
        activeStepRef.current = nextEvent;
        scheduleNext(nextEvent.duration); // duration = dwell time, not load time
      }, delay);
    };

    scheduleNext(400); // lead-in

    return () => clearTimeout(timer);
  }, [hasStarted, isRunning, infinite]);

  // -- spinner ticker (H1) --
  useEffect(() => {
    if (!hasStarted || !isRunning) return undefined;

    const iv = setInterval(() => {
      setFrame((current) => (current + 1) % claudeThinkingFrames.length);
    }, 420);

    return () => clearInterval(iv);
  }, [hasStarted, isRunning]);

  // -- exit after drain settles (§4.4: exit 0, ~1.2s settle) --
  useEffect(() => {
    if (!isRunning && hasStarted && timelineIndexRef.current >= claudeTimeline.length) {
      const t = setTimeout(() => exit(), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isRunning, hasStarted, exit]);

  // -- windowing budget (computed, not measured — see §3.2 fallback note
  //    above transcriptItemRows) — mirrors the exact strings/wrap widths
  //    used by the JSX below so the row-count estimate stays accurate. --
  const TIP_LINE = 'Run /init to create a CLAUDE.md file with instructions for Claude';
  const leftInner = Math.max(1, leftWidth - 3); // paddingX(2) + borderRight(1)
  const leftContentRows =
    wrapRows('Welcome back BusyCode!', leftInner) +
    wrapRows(`${ctx.model} · Claude Max · BusyCode`, leftInner) +
    wrapRows(ctx.workspace || FALLBACK_WORKSPACE, leftInner);
  const rightContentRows =
    wrapRows('Tips for getting started', tipsWidth) +
    wrapRows(TIP_LINE, tipsWidth) +
    3 + // marginY divider: margin-top(1) + content(1) + margin-bottom(1)
    wrapRows('Recent activity', tipsWidth) +
    1; // blank line
  // welcome card is the FIRST entry in the transcript queue (chat-style
  // bottom stacking) — it is NOT pinned chrome anymore. It participates in
  // the same FIFO windowing as every other transcript card and gets pushed
  // up (and eventually dropped) exactly like a real chat/terminal scroll.
  const welcomeCardRows =
    1 /* marginTop */ + 1 /* border top */ + Math.max(leftContentRows, rightContentRows) + 1 /* border bottom */ + 1; /* marginBottom */
  const bottomChromeRows =
    (isRunning && activeStep ? 1 : 0) /* pinned spinner/status line, above the composer's top divider */ +
    1 /* divider */ +
    1 /* composer — always rendered, during replay and after drain */ +
    1 /* divider */ +
    Math.min(ctx.statusLine.split('\n').length, 3); /* statusline */
  const SAFETY_MARGIN = 2; // headroom against wrap-estimate drift (word-wrap vs char-count)
  // budget covers the flexGrow transcript region's content — the welcome
  // card is no longer carved out ahead of time; it's just the first item in
  // displayEntries and competes for budget/windowing like any other card.
  const budget = Math.max(0, rows - bottomChromeRows - SAFETY_MARGIN);

  type DisplayEntry = { key: string; rows: number; node: React.ReactNode };

  // welcome card — the FIRST entry in the transcript queue (chat-style
  // bottom stacking), NOT pinned chrome. It's pushed into displayEntries
  // below like any other card, so as new cards append at the bottom it gets
  // pushed up and, once the window is full, dropped by the same FIFO
  // windowing loop that ages out the oldest transcript cards.
  const welcomeCardNode = (
    <Box
      key="welcome"
      marginTop={1}
      marginBottom={1}
      borderStyle="round"
      borderColor={palette.orange}
      flexDirection="row"
      width={width}
    >
      <Box
        flexDirection="column"
        width={leftWidth}
        paddingX={1}
        alignItems="center"
        borderStyle="single"
        borderColor={palette.orange}
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderRight
      >
        <Text bold color={palette.welcome}>
          Welcome back BusyCode!
        </Text>
        <Text color={palette.toolLine}>{ctx.model} · Claude Max · BusyCode</Text>
        <Text color={palette.toolLine}>{ctx.workspace || FALLBACK_WORKSPACE}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text color={palette.orange}>Tips for getting started</Text>
        <Text color={palette.toolLine}>
          Run <Text color={palette.welcome}>/init</Text> to create a CLAUDE.md file with instructions for Claude
        </Text>
        <Box marginY={1}>
          <Text color={palette.divider}>{'─'.repeat(tipsWidth)}</Text>
        </Box>
        <Text color={palette.orange}>Recent activity</Text>
        {/* interactive-only in the web fake (only set from a typed Enter
            prompt) — static replay never fabricates one (§3.4). */}
        <Text color={palette.toolLine}> </Text>
      </Box>
    </Box>
  );

  // welcome card is the first entry in the queue (see welcomeCardNode
  // above) — it participates in FIFO windowing exactly like transcript
  // cards, so once cards accumulate enough rows it's the first to be
  // dropped from the window (see welcomeVisible below).
  const displayEntries: DisplayEntry[] = [
    { key: 'welcome', rows: welcomeCardRows, node: welcomeCardNode },
    ...finalized.map((item, index) => ({
      key: `t-${index}`,
      rows: transcriptItemRows(item, width),
      node: <TranscriptCard key={`t-${index}`} item={item} palette={palette} width={width} />,
    })),
  ];

  if (isRunning && activeStep) {
    displayEntries.push({
      key: 'active',
      rows: activeStepRows(activeStep, width),
      node: <ActiveToolCard key="active" event={activeStep} palette={palette} />,
    });
  }

  // FIFO windowing — drops the OLDEST entry first (welcome card included —
  // it's just displayEntries[0]), keeping the newest always mounted, so the
  // visible window never exceeds `budget` (which already excludes the
  // bottom chrome).
  let windowStart = displayEntries.length;
  let used = 0;
  for (let i = displayEntries.length - 1; i >= 0; i -= 1) {
    const isNewest = i === displayEntries.length - 1;
    const candidateTotal = used + displayEntries[i].rows;
    if (!isNewest && candidateTotal > budget) break; // the newest entry is always kept
    used = candidateTotal;
    windowStart = i;
  }

  const windowedEntries = displayEntries.slice(windowStart);

  // welcome card is only rendered top-anchored when the FIFO windowing loop
  // above kept it in the window (windowStart === 0, i.e. entries[0] === the
  // 'welcome' key). Once accumulated card rows leave no budget for it, the
  // loop drops it first (it's the oldest queue entry) — it pops entirely in
  // one step rather than scrolling/fading, matching a real chat/terminal
  // FIFO. `cardEntries` excludes it so the two are laid out independently.
  const welcomeVisible = windowStart === 0;
  const cardEntries = welcomeVisible ? windowedEntries.slice(1) : windowedEntries;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {/* ── (0)/(1) transcript window: 유일한 flexGrow 영역.
          Layout: welcome card TOP-anchored (flexShrink=0, first frame it
          sits at row 0) → flexGrow spacer (absorbs the middle gap, shrinks
          as cards accumulate) → windowed transcript cards BOTTOM-anchored
          (newest at the bottom, directly above the pinned spinner/composer
          chrome), oldest-first order so they stack upward. The welcome card
          is still the FIRST entry in the FIFO queue (see displayEntries) —
          once the windowing loop above can no longer fit it alongside the
          accumulating cards, it disappears entirely (pop, not shrink) and
          the freed rows go to cards; from then on the existing FIFO loop
          ages out the oldest cards exactly as before. overflowY="hidden"
          stays on as a defensive backstop, the computed last-N windowing
          above is still the primary mechanism keeping content within the
          budget. ── */}
      <Box flexGrow={1} flexShrink={1} flexBasis={0} flexDirection="column" overflowY="hidden">
        {welcomeVisible ? <Box flexShrink={0}>{welcomeCardNode}</Box> : null}
        <Box flexGrow={1} />
        {cardEntries.map((entry) => entry.node)}
      </Box>

      {/* ── (2) bottom chrome: 전부 flexShrink={0} — yoga가 절대 찌그러뜨리지 못하게 ── */}

      {/* pinned spinner/status line — lives in the bottom chrome, directly
          above the composer's top divider, so it never scrolls with the
          transcript (spec: pin above composer, not inside the tool card). */}
      {isRunning && activeStep ? (
        <Box flexShrink={0}>
          <Text color={activeStep.ultra ? palette.thinkingUltra : palette.thinking}>
            {claudeThinkingFrames[frame]} {activeStep.statusText} (thinking with high effort)
          </Text>
        </Box>
      ) : null}

      <Box flexShrink={0}>
        <Text color={palette.divider}>{'─'.repeat(width)}</Text>
      </Box>

      {/* composer prompt — rendered at all times, matching real Claude Code
          (visible during replay AND after drain, not gated on !isRunning) */}
      <Box flexShrink={0}>
        <Text bold color={palette.welcome}>
          ❯
        </Text>
        <Text> </Text>
      </Box>

      <Box flexShrink={0}>
        <Text color={palette.divider}>{'─'.repeat(width)}</Text>
      </Box>

      {/* B1: statusLine is a single pre-composed string — no gitBranch /
          contextPercent fields exist on ClaudeContext, never fabricate them.
          F8 statusline height guard: multi-line \n은 clamp, 폭 초과는 truncate */}
      <Box flexShrink={0} height={Math.min(ctx.statusLine.split('\n').length, 3)} overflowY="hidden">
        <Text color={palette.statusPrimary} wrap="truncate">
          {ctx.statusLine}
        </Text>
      </Box>
    </Box>
  );
}
