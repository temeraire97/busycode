import type { ReactElement } from 'react';
import type { ClaudeContext } from '../config.js';
import { ClaudeLane } from './claude.js';

export interface LaneOptions {
  infinite?: boolean; // --infinite: loop the replay instead of drain -> exit
}

export interface Lane {
  id: string;
  render: (ctx: ClaudeContext, options?: LaneOptions) => ReactElement;
}

/**
 * Plain switch — only 'claude' exists in P2. Falls through to the same
 * single lane by default so callers never get `undefined`.
 *
 * NOTE: this file uses the `.tsx` extension (spec §5.1 sketched it as
 * `index.ts`) because `render` must build a JSX element (`<ClaudeLane .../>`)
 * rather than call `ClaudeLane` as a plain function — `ClaudeLane` uses React
 * hooks internally, and invoking a hook-using component directly (outside of
 * JSX / React's render dispatcher) violates the Rules of Hooks. JSX syntax
 * is only valid in `.tsx` files, so `index.ts` was renamed to `index.tsx`.
 */
export function selectLane(id: string): Lane {
  switch (id) {
    case 'claude':
    default:
      return { id: 'claude', render: (ctx, options) => <ClaudeLane ctx={ctx} infinite={options?.infinite} /> };
  }
}
