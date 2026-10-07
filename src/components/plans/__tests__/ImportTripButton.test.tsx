import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportTripButton from '../ImportTripButton';
import { db } from '../../../db';
import { buildTripFile } from '../../../services/tripTransfer';

const plan = {
  id: 'p1', name: 'Tokyo', destination: 'Tokyo, Japan', startDate: '2026-10-11', endDate: '2026-10-13',
  createdAt: '', updatedAt: '', deleted: false, itinerary: [],
};

const choose = (text: string) => {
  const file = new File([text], 'trip.journ.json', { type: 'application/json' });
  fireEvent.change(screen.getByTestId('import-trip-input'), { target: { files: [file] } });
};

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const show = () => render(<MemoryRouter><ImportTripButton /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('importing a trip', () => {
  it('adds it as a new trip and opens it', async () => {
    show();
    choose(JSON.stringify(buildTripFile(plan, [], [])));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/plan\/[^/]+\/itinerary$/)));
    expect(db.plans.add).toHaveBeenCalledWith(expect.objectContaining({ destination: 'Tokyo, Japan', deleted: false }));
    expect(vi.mocked(db.plans.add).mock.calls[0][0].id).not.toBe('p1');
  });

  it('says why a file cannot be opened, and adds nothing', async () => {
    show();
    choose('{"hello":1}');
    expect(await screen.findByTestId('import-trip-error')).toHaveTextContent('not a journ.ai trip');
    expect(db.plans.add).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
