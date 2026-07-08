import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, Static, useApp, useStdout } from 'ink';
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

interface ClaudePalette {
  green: string; // shell '›' prompt
  fg: string; // default tool title/icon + welcome-card meta text
  purpleUltra: string; // ultra tool title/icon (title.includes('Thinking'))
  toolLine: string; // tool detail lines, welcome-card meta/path/copy
  thinking: string; // active thinking line (non-ultra)
  thinkingUltra: string; // active thinking line (activeStep.ultra)
  orange: string; // card border, section titles, inner divider
  welcome: string; // welcome heading, composer prompt, /init inline
  userBg: string; // user line full-bleed background approximation
  userFg: string; // user line foreground
  statusPrimary: string; // bottom status row (ctx.statusLine)
  divider: string; // horizontal dividers
}

const DARK_PALETTE: ClaudePalette = {
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
 * palette — there is no light-theme CSS to port faithfully. Until a light
 * theme is designed for the web app, `ctx.theme === 'light'` falls back to
 * the same dark palette rather than fabricating unproven colors.
 */
function paletteFor(_theme: ClaudeContext['theme']): ClaudePalette {
  return DARK_PALETTE;
}

// ---------------------------------------------------------------------------
// small render helpers
// ---------------------------------------------------------------------------

function padToWidth(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
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

function ActiveToolCard({
  event,
  palette,
  frame,
}: {
  event: ClaudeTimelineEvent;
  palette: ClaudePalette;
  frame: number;
}) {
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
      {/* activeStep.ultra flag path (not title-based) — spec §3.2 */}
      <Text color={event.ultra ? palette.thinkingUltra : palette.thinking}>
        {claudeThinkingFrames[frame]} {event.statusText} (thinking with high effort)
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ClaudeLane
// ---------------------------------------------------------------------------

export function ClaudeLane({ ctx }: { ctx: ClaudeContext }) {
  const palette = paletteFor(ctx.theme);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = Math.min(stdout.columns ?? 80, 100);
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
          setFinalized((cur) => [...cur, { type: 'tool', title: done.title, lines: done.lines }]);
        }

        if (idx >= claudeTimeline.length) {
          // DRAIN — bounded index replaces the web fake's infinite
          // `idx % claudeTimeline.length` loop (B3).
          setActiveStep(null);
          activeStepRef.current = null;
          setIsRunning(false); // triggers cleanup of both timer effects
          return;
        }

        const nextEvent = claudeTimeline[idx];
        timelineIndexRef.current = idx + 1;
        setActiveStep(nextEvent);
        activeStepRef.current = nextEvent;
        scheduleNext(nextEvent.duration); // duration = dwell time, not load time
      }, delay);
      timer.unref?.();
    };

    scheduleNext(400); // lead-in

    return () => clearTimeout(timer);
  }, [hasStarted, isRunning]);

  // -- spinner ticker (H1) --
  useEffect(() => {
    if (!hasStarted || !isRunning) return undefined;

    const iv = setInterval(() => {
      setFrame((current) => (current + 1) % claudeThinkingFrames.length);
    }, 420);
    iv.unref?.();

    return () => clearInterval(iv);
  }, [hasStarted, isRunning]);

  // -- exit after drain settles (§4.4: exit 0, ~1.2s settle) --
  useEffect(() => {
    if (!isRunning && hasStarted && timelineIndexRef.current >= claudeTimeline.length) {
      const t = setTimeout(() => exit(), 1200);
      t.unref?.();
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isRunning, hasStarted, exit]);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color={palette.green} bold>
          ›
        </Text>
        <Text color={palette.green}> claude</Text>
      </Box>

      {/* welcome card — full-fidelity two-pane bordered card + inner divider
          (avatar dropped per user decision, §3.5) */}
      <Box marginTop={1} borderStyle="round" borderColor={palette.orange} flexDirection="row" width={width}>
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

      <Box flexDirection="column" marginTop={1}>
        <Static items={finalized}>
          {(item, index) => (
            <TranscriptCard key={`t-${index}`} item={item} palette={palette} width={width} />
          )}
        </Static>
        {isRunning && activeStep && <ActiveToolCard event={activeStep} palette={palette} frame={frame} />}
      </Box>

      <Box marginY={1}>
        <Text color={palette.divider}>{'─'.repeat(width)}</Text>
      </Box>

      {/* idle composer — appears once the timeline drains and settles */}
      {!isRunning && (
        <Box>
          <Text bold color={palette.welcome}>
            ❯
          </Text>
          <Text> </Text>
        </Box>
      )}

      <Box marginY={1}>
        <Text color={palette.divider}>{'─'.repeat(width)}</Text>
      </Box>

      {/* B1: statusLine is a single pre-composed string — no gitBranch /
          contextPercent fields exist on ClaudeContext, never fabricate them. */}
      <Box>
        <Text color={palette.statusPrimary}>{ctx.statusLine}</Text>
      </Box>
    </Box>
  );
}
