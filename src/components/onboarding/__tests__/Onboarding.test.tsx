import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';
import AppShell from '../../layout/AppShell';
import { ONBOARDED_STORAGE, hasOnboarded, requestOnboarding } from '../../../services/onboarding';
import { DEMO_PLAN_ID } from '../../../db/seed';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));

const onClose = vi.fn();
const show = () => render(<MemoryRouter><Onboarding onClose={onClose} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('first run', () => {
  it('opens when the introduction has not been seen', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
  });

  it('stays out of the way once it has', () => {
    localStorage.setItem(ONBOARDED_STORAGE, '1');
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument();
  });

  // Settings clears the flag, but the shell reads it once on mount — without
  // the event nothing would reopen until a reload.
  it('can be asked for again from elsewhere', () => {
    localStorage.setItem(ONBOARDED_STORAGE, '1');
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    act(() => requestOnboarding());
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
  });

  it('is remembered when closed', () => {
    show();
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(hasOnboarded()).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  // An introduction, not a gate.
  it('closes on Escape', () => {
    show();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(hasOnboarded()).toBe(true);
  });
});

/*
 * It was four screens: a pitch, a list of what the app is and is not, an AI
 * key form and a "you're set". The app's real use is simpler — everything
 * about a trip in one place — so the introduction is one screen that says so.
 */
describe('one screen', () => {
  it('says what the app keeps in one place', () => {
    show();
    const w = screen.getByTestId('onboarding-welcome');
    expect(w).toHaveTextContent('Your whole trip, in one place');
    expect(w).toHaveTextContent(/plan, day by day/i);
    expect(w).toHaveTextContent(/weather/i);
    expect(w).toHaveTextContent(/boarding passes, check-ins and booking emails/i);
  });

  // The key is optional; asking for it first said otherwise. It is in Settings.
  it('does not ask for an AI key, or carry the long lists', () => {
    show();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/What Journ.ai is not/)).not.toBeInTheDocument();
  });

  it('says where things are kept, in a line', () => {
    show();
    expect(screen.getByTestId('onboarding-privacy')).toHaveTextContent('Saved in this browser. No account needed.');
  });
});

describe('finishing', () => {
  it('hands over to the new-trip form', () => {
    show();
    fireEvent.click(screen.getByTestId('onboarding-create-plan'));
    expect(hasOnboarded()).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/plan/new');
  });

  it('opens the sample trip when there is one', () => {
    localStorage.setItem(DEMO_PLAN_ID, 'demo-1');
    show();
    fireEvent.click(screen.getByTestId('onboarding-see-sample'));
    expect(navigate).toHaveBeenCalledWith('/plan/demo-1/itinerary');
    expect(hasOnboarded()).toBe(true);
  });

  it('offers no sample when there is none', () => {
    show();
    expect(screen.queryByTestId('onboarding-see-sample')).not.toBeInTheDocument();
  });
});
