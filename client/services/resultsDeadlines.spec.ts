import { describe, it, expect } from 'vitest';
import { deadlineFor, deadlineProblems, deadlineStatus, parseDay } from './resultsDeadlines';

// Wednesday 12 November 2026, mid-morning.
const NOW = new Date(2026, 10, 12, 10, 30);

describe('parseDay', () => {
  it('reads YYYY-MM-DD (and ISO strings) as a local calendar day', () => {
    expect(parseDay('2026-11-14')).toEqual(new Date(2026, 10, 14));
    expect(parseDay('2026-11-14T00:00:00.000Z')).toEqual(new Date(2026, 10, 14));
    expect(parseDay('')).toBeNull();
    expect(parseDay('14/11/2026')).toBeNull();
    expect(parseDay('2026-02-30')).toBeNull();
  });
});

describe('deadlineFor', () => {
  it('returns the deadline of each test, or null', () => {
    const cfg = { week4Deadline: '2026-10-02', week8Deadline: null, endOfTermDeadline: 'rubbish' };
    expect(deadlineFor(cfg, 'week4')).toBe('2026-10-02');
    expect(deadlineFor(cfg, 'week8')).toBeNull();
    expect(deadlineFor(cfg, 'endOfTerm')).toBeNull();
    expect(deadlineFor(null, 'week4')).toBeNull();
  });
});

describe('deadlineStatus', () => {
  const at = (d: string, complete = false) => deadlineStatus(d, { now: NOW, complete });
  it('upcoming, due soon, due today, overdue', () => {
    expect(at('2026-11-20')).toMatchObject({ state: 'upcoming', daysLeft: 8, label: 'Due 20 Nov', tone: 'info' });
    expect(at('2026-11-15')).toMatchObject({ state: 'due-soon', daysLeft: 3, label: 'Due in 3 days', tone: 'warn' });
    expect(at('2026-11-13')).toMatchObject({ state: 'due-soon', daysLeft: 1, label: 'Due tomorrow' });
    // Still on time for the whole of the deadline day.
    expect(at('2026-11-12')).toMatchObject({ state: 'due-today', daysLeft: 0, label: 'Due today', tone: 'danger' });
    expect(at('2026-11-11')).toMatchObject({ state: 'overdue', daysLeft: -1, label: '1 day overdue', tone: 'danger' });
    expect(at('2026-11-02')).toMatchObject({ state: 'overdue', label: '10 days overdue' });
  });
  it('complete work is never overdue; no deadline is neutral', () => {
    expect(at('2026-11-02', true)).toMatchObject({ state: 'done', label: 'Complete', tone: 'ok' });
    expect(deadlineStatus(null, { now: NOW })).toMatchObject({ state: 'none', deadline: null, tone: 'neutral' });
  });
});

describe('deadlineProblems', () => {
  const all = { week4: true, week8: true, endOfTerm: true };
  it('accepts deadlines on or after the test date, in order', () => {
    expect(deadlineProblems({
      examTypes: all,
      dates: { week4: '2026-10-01', week8: '2026-10-29' },
      deadlines: { week4: '2026-10-01', week8: '2026-11-05', endOfTerm: '2026-12-10' },
      termStart: new Date(2026, 8, 1),
    })).toEqual({});
  });
  it('refuses a deadline before the test, before the term, or before an earlier test\'s deadline', () => {
    expect(deadlineProblems({
      examTypes: all,
      dates: { week4: '2026-10-01' },
      deadlines: { week4: '2026-09-30' },
    })).toEqual({ week4: 'The deadline is before the Week 4 test date.' });
    expect(deadlineProblems({
      examTypes: all,
      dates: {},
      deadlines: { week4: '2026-10-05', week8: '2026-08-20', endOfTerm: '2026-10-03' },
      termStart: new Date(2026, 8, 1),
    })).toEqual({
      week8: 'The deadline is before the term starts.',
      // compared with the last valid deadline (Week 4)
      endOfTerm: 'The deadline is before the Week 4 deadline.',
    });
  });
  it('ignores tests that are switched off and empty deadlines', () => {
    expect(deadlineProblems({
      examTypes: { week4: false, week8: true, endOfTerm: true },
      dates: { week4: '2026-12-01' },
      deadlines: { week4: '2026-01-01', week8: '', endOfTerm: '2026-12-10' },
    })).toEqual({});
  });
});
