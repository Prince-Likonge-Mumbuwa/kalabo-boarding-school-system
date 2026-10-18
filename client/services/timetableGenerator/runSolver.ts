// Runs the solver in a Web Worker (falls back to the page when workers are
// unavailable, e.g. in tests). Returns a handle to cancel.
import { solve, type SolveOptions } from './solver';
import type { Problem, SolveResult } from './types';

export interface SolverProgress {
  phase: 'placing' | 'improving';
  fraction: number;
  score: number;
  unplaced: number;
}

export interface SolverRun {
  promise: Promise<SolveResult>;
  cancel: () => void;
}

export function runSolver(
  problem: Problem,
  options: Pick<SolveOptions, 'seed' | 'maxMillis' | 'locked' | 'initial' | 'improveIterations'>,
  onProgress?: (p: SolverProgress) => void,
): SolverRun {
  if (typeof Worker === 'undefined') {
    let cancelled = false;
    const promise = new Promise<SolveResult>((resolve, reject) => {
      setTimeout(() => {
        if (cancelled) return reject(new Error('Cancelled'));
        try {
          resolve(solve(problem, { ...options, onProgress, shouldStop: () => cancelled }));
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
    return { promise, cancel: () => { cancelled = true; } };
  }

  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let rejectFn: (e: Error) => void = () => {};
  const promise = new Promise<SolveResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m);
      else if (m.type === 'done') {
        worker.terminate();
        resolve(m.result as SolveResult);
      } else if (m.type === 'error') {
        worker.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = e => {
      worker.terminate();
      reject(new Error(e.message || 'The timetable generator stopped unexpectedly.'));
    };
    worker.postMessage({ type: 'solve', problem, options });
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      rejectFn(new Error('Cancelled'));
    },
  };
}
