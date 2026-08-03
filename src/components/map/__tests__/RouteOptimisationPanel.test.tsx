import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RouteOptimisation from '../../tabs/RouteOptimisation';
import { type Day } from '../../../db';

const dayWith3Stops: Day = {
  dayIndex: 0,
  label: 'Day 1 — Mon 14 Jul',
  activities: [
    { id: 'a1', name: 'Temple Visit', time: '09:00', locationName: 'Tokyo', coordinates: [139.6917, 35.6895], notes: '', pinnedToTodo: false },
    { id: 'a2', name: 'Lunch in Shibuya', time: '12:00', locationName: 'Shibuya', coordinates: [139.7016, 35.658], notes: '', pinnedToTodo: false },
    { id: 'a3', name: 'Museum', time: '15:00', locationName: 'Ueno', coordinates: [139.7733, 35.7166], notes: '', pinnedToTodo: false },
  ],
};

const dayWith2Stops: Day = {
  dayIndex: 0,
  label: 'Day 1',
  activities: [
    { id: 'a1', name: 'Temple Visit', time: '09:00', locationName: 'Tokyo', coordinates: [139.6917, 35.6895], notes: '', pinnedToTodo: false },
    { id: 'a2', name: 'Lunch', time: '12:00', locationName: 'Shibuya', coordinates: [139.7016, 35.658], notes: '', pinnedToTodo: false },
  ],
};

describe('RouteOptimisation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.setItem('aitp_api_key', JSON.stringify({ ciphertext: 'abc', iv: 'def' }));
    localStorage.setItem('aitp_device_salt', 'dGVzdC1zYWx0');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the optimise button', () => {
    render(<RouteOptimisation planId="plan-1" day={dayWith3Stops} planStartDate="2025-07-14" isOffline={false} />);
    expect(screen.getByTestId('optimise-route-btn')).toBeTruthy();
  });

  it('disables Optimise Route when fewer than 3 geocoded stops', () => {
    render(<RouteOptimisation planId="plan-1" day={dayWith2Stops} planStartDate="2025-07-14" isOffline={false} />);
    expect(screen.getByTestId('optimise-route-btn').getAttribute('aria-disabled')).toBe('true');
  });

  it('disables Optimise Route when offline', () => {
    render(<RouteOptimisation planId="plan-1" day={dayWith3Stops} planStartDate="2025-07-14" isOffline={true} />);
    const btn = screen.getByTestId('optimise-route-btn');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('title')).toContain('offline');
  });

  it('shows optimise button enabled when 3+ stops and online', () => {
    render(<RouteOptimisation planId="plan-1" day={dayWith3Stops} planStartDate="2025-07-14" isOffline={false} />);
    const btn = screen.getByTestId('optimise-route-btn');
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('does not show optimisation overlay by default', () => {
    render(<RouteOptimisation planId="plan-1" day={dayWith3Stops} planStartDate="2025-07-14" isOffline={false} />);
    expect(screen.queryByTestId('optimisation-overlay')).toBeNull();
  });
});
