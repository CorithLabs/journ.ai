import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeviceReport, { deviceReport } from '../DeviceReport';
import { db } from '../../../db';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

// A layout bug on one phone cannot be diagnosed from another: these are the
// numbers that decide phone or desktop layout, as that phone reports them.
describe('what the app sees on this device', () => {
  it('reports the widths, zoom and layout that decide phone or desktop', () => {
    const text = deviceReport(true, 2);
    for (const line of ['App: v', 'Layout: phone', 'Window (CSS px):', 'Screen (CSS px):', 'Pixel ratio:', 'Phone-width match:', 'Installed app:', 'Trips stored: 2', 'Sample trip added: no', 'Browser:']) {
      expect(text).toContain(line);
    }
  });

  it('copies the report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MemoryRouter><DeviceReport /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('copy-device-report'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Layout:')));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  // For anyone who deleted it, or whose first launch did not add it.
  it('adds the sample trip on request and opens it', async () => {
    render(<MemoryRouter><DeviceReport /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('add-sample-trip'));
    await waitFor(() => expect(db.plans.add).toHaveBeenCalledWith(expect.objectContaining({ destination: 'Tokyo, Japan' })));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/plan\/.+\/itinerary$/)));
  });
});
