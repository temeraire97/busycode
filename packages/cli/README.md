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
  -v, --version     Print version and exit
  -h, --help        Print this help and exit
```

In a non-interactive shell (no TTY on stdin — e.g. piped or CI), `busycode`
prints `busycode (static)` and exits immediately instead of rendering.

`--real` only changes what is *displayed* (workspace path, statusline); it
never writes to disk and never talks to any live Claude session.

## License

MIT — see [LICENSE](./LICENSE).
