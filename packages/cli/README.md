# busycode

Terminal-native replay of a Claude Code session. Prints a neutral, self-exiting
simulation of a Claude Code terminal UI — a scripted timeline, not a live
model or agent.

## Usage

### From a clone (primary path)

```sh
git clone <this-repo-url>
cd <repo>
pnpm install
cd packages/cli
pnpm build
node dist/cli.js
```

Or link it onto your `PATH`:

```sh
pnpm link --global
busycode
```

### Once published to npm

Installs the `busycode-cli` package, which provides the `busycode` command.

```sh
npx busycode-cli
# or
npm i -g busycode-cli
busycode
```

## Options

```
Usage:
  busycode [options]

Options:
  --real            Render the live statusline from your Claude settings (display-only)
  --model <label>   Displayed model label (default: claude-sonnet-4-5 (default))
  --theme <name>    Color theme: dark | light (default: dark)
  --light           Shortcut for --theme light
  --dark            Shortcut for --theme dark
  --infinite        Loop the replay until interrupted (Ctrl+C)
  -v, --version     Print version and exit
  -h, --help        Print this help and exit
```

In a non-interactive shell (no TTY on stdin — e.g. piped or CI), `busycode`
prints `busycode (static)` and exits immediately instead of rendering.

`--real` only changes what is *displayed* (workspace path, statusline); it
never writes to disk and never talks to any live Claude session.

`--infinite` loops the replay forever instead of exiting when the timeline
drains: once the final event settles, the transcript resets and replay
starts again from the beginning. Only `Ctrl+C` (or another kill signal)
ends the session; without the flag, behavior is unchanged (drain → exit 0).

## Fullscreen

`busycode` renders full-screen by default, using the terminal's alternate
screen buffer (the same mechanism as `vim`, `htop`, and `less`). Layout uses
the full terminal width and height. When the replay ends or you exit with
`Ctrl+C`, the terminal is restored to whatever was on screen before `busycode`
started — this is the primary/alternate buffer switch, not a manual redraw.

Because the alternate screen has no scrollback of its own, the replay
transcript is **not** left in your terminal's scrollback history after exit.
This is intentional (it mirrors how `vim`/`htop` behave) and is a deliberate
difference from the real Claude Code CLI, which renders inline and does
leave its output in scrollback.

Non-TTY behavior is unchanged: piped/CI invocations still print
`busycode (static)` and exit without touching the screen at all.

**Recovery:** if `busycode` is killed forcibly (e.g. `kill -9`) or the
terminal crashes mid-session, the terminal can be left showing the alternate
screen. Run `reset` (or `tput rmcup`) in the affected terminal to restore it.

## License

MIT — see [LICENSE](./LICENSE).
