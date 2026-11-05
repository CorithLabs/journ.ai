import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KnowBeforeYouGo from '../KnowBeforeYouGo';
import { countryFacts, plugsFit } from '../../../data/countryFacts';
import { travelBasics } from '../../../utils/tripStartTodos';
import { useAppStore } from '../../../store';
import * as aiKey from '../../../services/aiKey';
import type { Plan } from '../../../db';

vi.mock('../../../services/aiKey', async (importActual) => ({
  ...(await importActual<typeof import('../../../services/aiKey')>()),
  hasStoredKey: vi.fn().mockReturnValue(false),
}));

const plan = (extra: Partial<Plan> = {}): Plan => ({
  id: 'p1', name: 'Tokyo', destination: 'Tokyo, Japan', country: 'Japan', startDate: '2026-11-09', endDate: '2026-11-11',
  createdAt: '', updatedAt: '', deleted: false, itinerary: [], ...extra,
});

beforeEach(() => {
  vi.mocked(aiKey.hasStoredKey).mockReturnValue(false);
  useAppStore.setState({ pendingAgentQuestion: null, agentPanelOpen: false });
});

describe('the country table', () => {
  it('finds a country by code, name or another name for it', () => {
    expect(countryFacts('JP')?.name).toBe('Japan');
    expect(countryFacts('japan')?.code).toBe('JP');
    expect(countryFacts('UK')?.code).toBe('GB');
    expect(countryFacts('Turkey')?.code).toBe('TR');
    expect(countryFacts('Atlantis')).toBeNull();
  });

  it('knows when plugs from home fit', () => {
    expect(plugsFit(countryFacts('CA')!, countryFacts('JP')!)).toBe(true);
    expect(plugsFit(countryFacts('DE')!, countryFacts('FR')!)).toBe(true);
    expect(plugsFit(countryFacts('GB')!, countryFacts('FR')!)).toBe(false);
    expect(plugsFit(countryFacts('US')!, countryFacts('GB')!)).toBe(false);
  });
});

// The adapter to-do says which one, and is left off when home plugs fit.
describe('the plug adapter to-do', () => {
  const adapter = (countries: { destination?: string; origin?: string }) =>
    travelBasics('p1', true, countries).map((t) => t.title).find((t) => /adapter/i.test(t));

  it('names the plug type and voltage', () => {
    expect(adapter({ destination: 'GB', origin: 'US' })).toBe('Pack a plug adapter for Type G (United Kingdom, 230 V)');
  });

  it('is left off when the plugs from home already fit', () => {
    expect(adapter({ destination: 'JP', origin: 'CA' })).toBeUndefined();
  });

  it('stays generic when the destination is not known', () => {
    expect(adapter({})).toBe('Pack a universal plug adapter');
  });
});

describe('know before you go', () => {
  it('shows the plug, emergency number, money, tap water and driving side', () => {
    render(<KnowBeforeYouGo plan={plan()} />);
    const card = screen.getByTestId('country-JP');
    expect(card).toHaveTextContent('Type A / B · 100 V');
    expect(card).toHaveTextContent('110 police · 119 ambulance & fire');
    expect(card).toHaveTextContent('Japanese yen (JPY)');
    expect(card).toHaveTextContent('Safe to drink');
    expect(card).toHaveTextContent('On the left');
    expect(screen.getByText(/general guide/)).toBeInTheDocument();
  });

  it('says whether plugs from home fit, and to check voltage', () => {
    render(<KnowBeforeYouGo plan={plan({ origin: { label: 'London', city: 'London', countryCode: 'GB' } })} />);
    expect(screen.getByText('Your Type G plugs need an adapter.')).toBeInTheDocument();
    expect(screen.getByText(/100–240 V/)).toBeInTheDocument();
  });

  it('shows each country of a multi-country trip, and not home', () => {
    render(<KnowBeforeYouGo plan={plan({
      origin: { label: 'Toronto', city: 'Toronto', countryCode: 'CA' },
      stops: [{ id: 's1', city: 'Seoul', country: 'South Korea' }, { id: 's2', city: 'Vancouver', country: 'Canada' }],
    })} />);
    expect(screen.getByTestId('country-JP')).toHaveTextContent('Japan');
    expect(screen.getByTestId('country-KR')).toBeInTheDocument();
    expect(screen.queryByTestId('country-CA')).not.toBeInTheDocument();
  });

  it('shows nothing for a country it does not know', () => {
    const { container } = render(<KnowBeforeYouGo plan={plan({ destination: 'Atlantis', country: undefined })} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Tipping, phrases and scams come from the AI, in the chat, when there is a key.
  it('asks the chat about tipping, phrases and scams when there is a key', () => {
    vi.mocked(aiKey.hasStoredKey).mockReturnValue(true);
    render(<KnowBeforeYouGo plan={plan()} />);
    fireEvent.click(screen.getByTestId('ask-local-tips'));
    expect(useAppStore.getState().pendingAgentQuestion).toMatch(/tipping, useful phrases and common scams in Japan/);
    expect(useAppStore.getState().agentPanelOpen).toBe(true);
  });

  it('does not offer it without a key', () => {
    render(<KnowBeforeYouGo plan={plan()} />);
    expect(screen.queryByTestId('ask-local-tips')).not.toBeInTheDocument();
  });
});
