// @vitest-environment jsdom
// Date of birth as Day / Month / Year dropdowns, stored as "YYYY-MM-DD".
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DateOfBirthSelect, joinDob, splitDob } from './DateOfBirthSelect';

afterEach(cleanup);

describe('date of birth dropdowns', () => {
  it('splits and joins ISO dates; a bare birth year fills the year only; 31 Feb is clamped', () => {
    expect(splitDob('2010-03-07')).toEqual({ year: '2010', month: '3', day: '7' });
    expect(splitDob('', 2011)).toEqual({ year: '2011', month: '', day: '' });
    expect(joinDob({ year: '2010', month: '3', day: '7' })).toBe('2010-03-07');
    expect(joinDob({ year: '2010', month: '', day: '7' })).toBe('');
    expect(joinDob({ year: '2012', month: '2', day: '31' })).toBe('2012-02-29');
  });

  it('gives the ISO date once day, month and year are chosen', () => {
    const onChange = vi.fn();
    render(<DateOfBirthSelect value="" onChange={onChange} minYear={2000} maxYear={2020} />);
    fireEvent.change(screen.getByLabelText('Year of birth'), { target: { value: '2012' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ iso: '', year: '2012' }));
    fireEvent.change(screen.getByLabelText('Month of birth'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Day of birth'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ iso: '2012-04-09' }));
    // Years newest first, within the range.
    const years = Array.from((screen.getByLabelText('Year of birth') as HTMLSelectElement).options).map(o => o.value).filter(Boolean);
    expect(years[0]).toBe('2020');
    expect(years[years.length - 1]).toBe('2000');
  });

  it('shows a saved date', () => {
    render(<DateOfBirthSelect value="2009-11-23" onChange={() => {}} />);
    expect((screen.getByLabelText('Day of birth') as HTMLSelectElement).value).toBe('23');
    expect((screen.getByLabelText('Month of birth') as HTMLSelectElement).value).toBe('11');
    expect((screen.getByLabelText('Year of birth') as HTMLSelectElement).value).toBe('2009');
  });
});
