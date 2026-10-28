import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { buildSummonsMessage, nextSchoolDay, shortDate, smsLength, toGsm7, type SummonsInput } from './smsTemplates';

const base: SummonsInput = {
  learnerName: 'John Mwale',
  className: 'Grade 10A',
  date: '2026-10-30',
  time: '09:00',
  place: 'head',
  signer: 'Deputy Head',
  phone: '0977 123 456',
};

describe('toGsm7 / smsLength', () => {
  it('makes smart punctuation plain and drops what would force UCS-2', () => {
    expect(toGsm7('Mwale’s “son” – ok… 👍 €5 [x]')).toBe(`Mwale's "son" - ok... 5 x`);
    expect(smsLength(toGsm7('Mwale’s 👍')).gsm).toBe(true);
  });
  it('counts like the network: 160 GSM-7, 70 UCS-2', () => {
    expect(smsLength('a'.repeat(160))).toEqual({ chars: 160, sms: 1, gsm: true });
    expect(smsLength('a'.repeat(161)).sms).toBe(2);
    expect(smsLength('’' + 'a'.repeat(70)).sms).toBe(2);
  });
});

describe('dates', () => {
  it('short date and the next school day', () => {
    expect(shortDate('2026-10-30')).toBe('Fri 30 Oct');
    expect(nextSchoolDay(new Date(2026, 9, 28))).toBe('2026-10-29'); // Wed → Thu
    expect(nextSchoolDay(new Date(2026, 9, 30))).toBe('2026-11-02'); // Fri → Mon
  });
});

describe('buildSummonsMessage', () => {
  it('fills the template in one SMS', () => {
    const msg = buildSummonsMessage(base);
    expect(msg).toBe(
      "Kalabo Boarding Sec: Parent of John Mwale (Grade 10A), please report to the Head's office on Fri 30 Oct at 09:00. Tel 0977123456. -The Deputy Head",
    );
    expect(smsLength(msg)).toMatchObject({ sms: 1, gsm: true });
  });

  it('signs as the Head and leaves the phone out when blank', () => {
    const msg = buildSummonsMessage({ ...base, signer: 'Head', place: 'guidance', phone: '' });
    expect(msg).toContain('report to the Guidance office');
    expect(msg).not.toContain('Tel');
    expect(msg.endsWith('-The Head')).toBe(true);
  });

  it('shortens long names step by step and never goes over one SMS', () => {
    const long = buildSummonsMessage({ ...base, learnerName: 'Mwangala Chisenga Nalishebo Mukelabai', place: 'deputy' });
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long).toContain('Mwangala C. N. Mukelabai');

    const huge = buildSummonsMessage({ ...base, learnerName: 'Mwangalabanjibelele Chisengamwanamakumbi Nalishebomukelabainamunyangwa Mukelabaimulenamwansakamakumbi', place: 'deputy' });
    expect(huge.length).toBeLessThanOrEqual(160);
    expect(huge.startsWith('Kalabo Boarding Sec: Parent of Mwangala')).toBe(true);
    expect(huge).toContain("the Deputy Head's office on Fri 30 Oct at 09:00.");
    expect(huge.endsWith('-The Deputy Head')).toBe(true);
  });

  it('cleans names typed with smart characters', () => {
    const msg = buildSummonsMessage({ ...base, learnerName: 'Chola O’Brien' });
    expect(msg).toContain("Chola O'Brien");
    expect(smsLength(msg).gsm).toBe(true);
  });
});
