// Runs the timetable solver off the main thread so the page stays responsive.
// Messages in:  { type: 'solve', problem, options }
// (To cancel, the page terminates the worker: a running solve cannot read
// further messages.)
// Messages out: { type: 'progress', … }  |  { type: 'done', result }  |  { type: 'error', message }
import { solve, type SolveOptions } from './solver';
import type { Problem } from './types';

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: 'solve'; problem: Problem; options: Omit<SolveOptions, 'onProgress' | 'shouldStop' | 'now'> };
  if (msg?.type !== 'solve') return;
  try {
    let last = 0;
    const result = solve(msg.problem, {
      ...msg.options,
      onProgress: p => {
        const t = Date.now();
        if (t - last < 150) return;
        last = t;
        (self as unknown as Worker).postMessage({ type: 'progress', ...p });
      },
    });
    (self as unknown as Worker).postMessage({ type: 'done', result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: (err as Error)?.message || String(err) });
  }
};
