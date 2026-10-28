// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const send = vi.fn();
vi.mock('@/services/smsService', () => ({ smsService: { sendAnnouncement: (...a: any[]) => send(...a) } }));
vi.mock('@/hooks/useSchoolLearners', () => ({
  useSchoolLearners: () => ({
    learners: [{ id: 'd1', studentId: 'G10A_001', fullName: 'John Chola Mwale', className: 'Grade 10A' }],
  }),
}));
vi.mock('@/services/resultsService', async () => {
  // Only the GSM-7 check is needed; avoid loading Firebase.
  const gsm = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà{}[]~|^\\";
  return { isGsm7: (t: string) => [...t].every(c => gsm.includes(c)) };
});

import { AnnouncementModal } from './AnnouncementModal';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 9, 0)); // Wed 28 Oct 2026
  send.mockReset();
  send.mockResolvedValue({ sent: 1, failed: 0, total: 1 });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const open = () => render(<AnnouncementModal isOpen onClose={() => {}} senderName="Admin" senderUid="A1" />);
const pickLearner = () => {
  fireEvent.click(screen.getByText('One Parent'));
  fireEvent.change(screen.getByPlaceholderText('Type at least 2 characters...'), { target: { value: 'mwale' } });
  fireEvent.click(screen.getByText('John Chola Mwale'));
};

describe('AnnouncementModal — summon a parent', () => {
  it('fills the one-SMS template and sends it as a summons', async () => {
    open();
    pickLearner();
    fireEvent.click(screen.getByRole('radio', { name: /Summon to office/ }));
    fireEvent.click(screen.getByText('Deputy Head'));
    fireEvent.change(screen.getByLabelText('Report to'), { target: { value: 'guidance' } });
    fireEvent.change(screen.getByLabelText('Call-back number'), { target: { value: '0977 123 456' } });

    const text = (screen.getByLabelText('Message') as HTMLTextAreaElement).value;
    expect(text).toBe(
      'Kalabo Boarding Sec: Parent of John Chola Mwale (Grade 10A), please report to the Guidance office on Thu 29 Oct at 09:00. Tel 0977123456. -The Deputy Head',
    );
    expect(screen.getByLabelText('Message length').textContent).toBe(`${text.length} / 160 • 1 SMS`);

    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toMatchObject({
      message: text,
      target: { type: 'student', studentId: 'G10A_001' },
      category: 'summons',
      summons: { date: '2026-10-29', time: '09:00', place: 'the Guidance office', signer: 'The Deputy Head' },
    });
    expect(localStorage.getItem('summons.callbackPhone')).toBe('0977 123 456');
  });

  it('blocks a summons edited past one SMS, and cleans smart characters', () => {
    open();
    pickLearner();
    fireEvent.click(screen.getByRole('radio', { name: /Summon to office/ }));
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Mwale’s parent – please come' } });
    expect(box.value).toBe("Mwale's parent - please come");
    fireEvent.change(box, { target: { value: 'x'.repeat(161) } });
    expect(screen.getByText(/A summons must fit in one SMS/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Send/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a free message to all parents works as before', async () => {
    open();
    expect(screen.queryByRole('radio', { name: /Summon to office/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'School closes Friday.' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toEqual({ message: 'School closes Friday.', target: { type: 'all' }, senderName: 'Admin', senderUid: 'A1' });
  });
});
