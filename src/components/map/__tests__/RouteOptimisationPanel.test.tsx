import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteOptimisationPanel from '../RouteOptimisation';
import { type Day } from '../../../db';

const dayWith3Stops: Day = {
  dayIndex: 0,
  label: 'Day 1 — Mon 14 Jul',
  activities: [
    {
      id: 'a1',
      name: 'Temple Visit',
      time: '09:00',
      locationName: 'Tokyo',
      coordinates: [139.6917, 35.6895],
      notes: '',
      pinnedToTodo: false,
    },
    {
      id: 'a2',
      name: 'Lunch in Shibuya',
      time: '12:00',
      locationName: 'Shibuya',
      coordinates: [139.7016, 35.658],
      notes: '',
      pinnedToTodo: false,
    },
    {
      id: 'a3',
      name: 'Museum',
      time: '15:00',
      locationName: 'Ueno',
      coordinates: [139.7733, 35.7166],
      notes: '',
      pinnedToTodo: false,
    },
  ],
};

const dayWith2Stops: Day = {
  dayIndex: 0,
  label: 'Day 1',
  activities: [
    {
      id: 'a1',
      name: 'Temple Visit',
      time: '09:00',
      locationName: 'Tokyo',
      coordinates: [139.6917, 35.6895],
      notes: '',
      pinnedToTodo: false,
    },
    {
      id: 'a2',
      name: 'Lunch',
      time: '12:00',
      locationName: 'Shibuya',
      coordinates: [139.7016, 35.658],
      notes: '',
      pinnedToTodo: false,
    },
  ],
};

describe('RouteOptimisationPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.setItem('aitp_api_key', JSON.stringify({ ciphertext: 'abc', iv: 'def' }));
    localStorage.setItem('aitp_device_salt', 'dGVzdC1zYWx0');
  });

  it('shows the optimise button', () => {
    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    expect(screen.getByTestId('optimise-route-btn')).toBeTruthy();
  });

  it('disables Optimise Route when fewer than 3 geocoded stops', () => {
    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith2Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    const btn = screen.getByTestId('optimise-route-btn');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('disables Optimise Route when offline', () => {
    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={true}
      />,
    );
    const btn = screen.getByTestId('optimise-route-btn');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('title')).toContain('offline');
  });

  it('shows loading state when optimise is clicked', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    fireEvent.click(screen.getByTestId('optimise-route-btn'));
    await waitFor(() => {
      expect(screen.getByText(/Analysing route/)).toBeTruthy();
    });
  });

  it('shows "already optimal" when AI returns same order', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '["Temple Visit", "Lunch in Shibuya", "Museum"]',
          },
        }],
      }),
    } as Response);

    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    fireEvent.click(screen.getByTestId('optimise-route-btn'));
    await waitFor(() => {
      expect(screen.getByText(/already optimal/)).toBeTruthy();
    });
  });

  it('shows optimisation overlay when AI returns different order', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '["Museum", "Temple Visit", "Lunch in Shibuya"]',
          },
        }],
      }),
    } as Response);

    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    fireEvent.click(screen.getByTestId('optimise-route-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('optimisation-overlay')).toBeTruthy();
    });
    expect(screen.getByTestId('accept-optimisation-btn')).toBeTruthy();
    expect(screen.getByTestId('reject-optimisation-btn')).toBeTruthy();
  });

  it('dismisses overlay when Reject All is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["Museum", "Temple Visit", "Lunch in Shibuya"]' } }],
      }),
    } as Response);

    render(
      <RouteOptimisationPanel
        planId="plan-1"
        day={dayWith3Stops}
        planStartDate="2025-07-14"
        isOffline={false}
      />,
    );
    fireEvent.click(screen.getByTestId('optimise-route-btn'));
    await waitFor(() => expect(screen.getByTestId('optimisation-overlay')).toBeTruthy());

    fireEvent.click(screen.getByTestId('reject-optimisation-btn'));
    expect(screen.queryByTestId('optimisation-overlay')).toBeNull();
    expect(screen.getByTestId('optimise-route-btn')).toBeTruthy();
  });
});
