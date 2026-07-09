// packages/cli/src/fullscreen.ts
//
// Alt-screen 자체는 Ink 7의 `render(..., { alternateScreen: true })`가 소유한다:
// enter(?1049h)+hideCursor는 첫 frame 전에, exit(?1049l)+showCursor는 unmount 및
// signal-exit(SIGINT/SIGTERM/SIGHUP) 경로에서 Ink가 쓴다. 이 모듈은 단 하나의
// uncovered path만 처리한다: uncaught error의 stack이 alt buffer에 찍힌 뒤
// restore와 함께 지워져 보이지 않게 되는 문제 — restore 후 primary buffer에
// stack을 다시 출력한다.
//
// 절대 금지: process.on('SIGINT'/'SIGTERM') 등록. bare listener가 있으면
// signal-exit의 re-raise가 억제되어 Ctrl+C로 프로세스가 종료되지 않는다.

type Unmount = () => void;

export function installErrorSurfacing(unmount: Unmount): () => void {
  const surface = (err: unknown): void => {
    try {
      unmount(); // Ink unmount는 idempotent (isUnmounted guard + writeBestEffort)
    } catch {
      // best-effort — restore 실패해도 stack 출력은 진행
    }
    const text =
      err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`\n${text}\n`);
    process.exitCode = 1;
  };

  const onUncaught = (err: unknown): void => {
    surface(err);
    process.exit(1); // 'exit' -> signal-exit -> unmount 재호출 (idempotent, 무해)
  };
  const onUnhandled = (reason: unknown): void => {
    surface(reason);
    process.exit(1);
  };

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  return () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUnhandled);
  };
}
