// @vitest-environment jsdom
// The admin nerve centre on a sample school (client/test/nerveFixture.ts),
// Thursday 12 Nov 2026 at 10:20.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Charts measure their box; jsdom has no ResizeObserver.
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const fx = vi.hoisted(() => ({ data: null as any }));
vi.mock('@/hooks/useNerveCentre', () => ({ useNerveCentre: () => fx.data }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/AnnouncementModal', () => ({ AnnouncementModal: ({ isOpen }: any) => (isOpen ? <div role="dialog">Announcement</div> : null) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'ADMIN', fullName: 'Jean Hakalima', userType: 'admin' } }) }));

import AdminDashboard from './AdminDashboard';
import { NOW, nerveData } from '../test/nerveFixture';

const renderIt = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fx.data = nerveData();
  try { localStorage.clear(); } catch { /* */ }
});
afterEach(() => vi.useRealTimers());

describe('Admin nerve centre', () => {
  it('command band: greeting, term and week, the five vital signs', () => {
    renderIt();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, Jean');
    expect(screen.getByText(/Term 3 2026 · week 11 · 22 days to the end of term/)).toBeTruthy();
    // A vital is a link whose first line is its label.
    const vital = (label: RegExp) => screen.getAllByRole('link').find(a => label.test(a.querySelector('span')?.textContent?.trim() ?? ''))!;
    expect(within(vital(/^Present today/)).getByText(/^\d+%$/)).toBeTruthy();
    expect(within(vital(/^Daily registers/)).getByText('3/5')).toBeTruthy();
    expect(within(vital(/^Daily registers/)).getByText('2 not taken yet')).toBeTruthy();
    expect(within(vital(/^Lessons/)).getByText('2 with no teacher')).toBeTruthy(); // P5 Grade 10A now, P7 Grade 12A later
    expect(within(vital(/^Week 8 results/)).getByText('71%')).toBeTruthy();
    expect(vital(/^Week 8 results/).getAttribute('href')).toBe('/dashboard/admin/results-monitor');
    expect(within(vital(/^Pass rate · Week 8/)).getByText(/vs Term 2 2026/)).toBeTruthy();
  });

  it('needs attention: only problems, worst first, each linking to where to fix it', () => {
    renderIt();
    const strip = screen.getByRole('region', { name: 'Needs attention' });
    // The first 8 show; the rest behind "Show all".
    expect(within(strip).getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(within(strip).getByRole('button', { name: /Show all \d+/ }));
    const items = within(strip).getAllByRole('listitem').map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(items[0]).toMatch(/^Urgent2 classes haven't taken today's registerRegisters · Form 1B, Grade 12A/);
    expect(items[1]).toMatch(/^Urgent1 lesson running now with no teacherLessons · P5 Grade 10A/);
    expect(items.some(t => /Week 8 results due in 1d 13h 40m — 2 teachers not finished/.test(t))).toBe(true);
    expect(items.some(t => /No results deadline for End of Term/.test(t))).toBe(true);
    expect(items.some(t => /1 class subject with no teacher.*Grade 12A ICT/.test(t))).toBe(true);
    expect(items.some(t => /1 class without a form teacher/.test(t))).toBe(true);
    expect(items.some(t => /2 SMS failed to send this week/.test(t))).toBe(true);
    const fix = within(strip).getByText(/haven't taken today's register/).closest('a')!;
    expect(fix.getAttribute('href')).toBe('/dashboard/admin/attendance-overview');
  });

  it('all clear when nothing is wrong', () => {
    fx.data = nerveData({
      registers: { ...nerveData().registers, data: nerveData().registers.data.map((r: any) => r) },
      board: { ...nerveData().board, data: { ...nerveData().board.data, dayOfWeek: null } },
      configs: { ...nerveData().configs, data: [{ ...nerveData().configs.data[0], endOfTermDeadline: '2026-12-01' }] },
      monitor: { ...nerveData().monitor, deadlines: [] },
      slots: { ...nerveData().slots, data: [] },
      classes: { ...nerveData().classes, data: nerveData().classes.data.map((c: any) => ({ ...c, formTeacherId: 'T9' })) },
      learners: { ...nerveData().learners, data: [] },
      sms: { ...nerveData().sms, data: 0 },
    });
    renderIt();
    expect(screen.getByText('All clear')).toBeTruthy();
  });

  it('today: attendance, lessons by period, staff', () => {
    renderIt();
    const att = screen.getByRole('region', { name: 'Attendance today' });
    expect(within(att).getByText(/learners in school/)).toBeTruthy();
    expect(within(att).getByText(/Not yet: Form 1B, Grade 12A/)).toBeTruthy();
    const lessons = screen.getByRole('region', { name: 'Lessons today' });
    expect(within(lessons).getAllByRole('listitem').map(p => p.textContent?.slice(0, 2))).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    const staff = screen.getByRole('region', { name: 'Staff' });
    expect(within(staff).getByText('Ms Zulu')).toBeTruthy();
  });

  it('term: timeline, results entry with the live countdown, performance by form and subject', () => {
    renderIt();
    const termP = screen.getByRole('region', { name: 'Term' });
    expect(within(termP).getByText(/Next:/).textContent).toMatch(/Week 8 results due on Friday,? 13 November/);
    const results = screen.getByRole('region', { name: 'Results entry' });
    expect(within(results).getByText('Complete')).toBeTruthy();
    expect(within(results).getAllByRole('timer')[0].textContent).toMatch(/Results due in 1d 13h 40m 00s/);
    expect(within(results).getByText('No deadline set')).toBeTruthy();
    const perf = screen.getByRole('region', { name: 'Performance' });
    expect(within(perf).getByText(/By form · Week 8/)).toBeTruthy();
    expect(within(perf).getByText('Strongest')).toBeTruthy();
  });

  it('learners at risk, enrolment, data quality, recent activity', () => {
    renderIt();
    const risk = screen.getByRole('region', { name: 'Learners at risk' });
    expect(within(risk).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(risk).getAllByText(/failing \d subjects|attendance \d+%/, { selector: 'span' }).length).toBeGreaterThan(0);
    const enrol = screen.getByRole('region', { name: 'Enrolment' });
    expect(within(enrol).getByText('60')).toBeTruthy();
    expect(within(enrol).getByText('admitted this term', { exact: false }).textContent).toMatch(/^5 admitted/);
    const dq = screen.getByRole('region', { name: 'Data quality' });
    expect(within(dq).getByText('No guardian phone').closest('a')!.textContent).toMatch(/2$/);
    const act = screen.getByRole('region', { name: 'Recent activity' });
    expect(within(act).getByText(/Mr Mwale saved Week 8 marks/)).toBeTruthy();
    expect(within(act).getByText('3 min ago')).toBeTruthy();
  });

  it('focus: Operations puts Today first and is remembered; the brief can go to WhatsApp', () => {
    renderIt();
    const termCol = () => screen.getByRole('region', { name: 'Term' }).parentElement!.parentElement!;
    expect(termCol().className).toContain('order-1');
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    expect(termCol().className).toContain('order-2');
    expect(localStorage.getItem('nerve-centre-focus')).toBe('ops');
    const wa = screen.getByRole('link', { name: /Brief on WhatsApp/ }).getAttribute('href')!;
    expect(decodeURIComponent(wa)).toMatch(/Kalabo Boarding Secondary School — daily brief[\s\S]*Needs attention:[\s\S]*2 classes haven't taken today's register/);
    fireEvent.click(screen.getByRole('button', { name: /Announce/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
