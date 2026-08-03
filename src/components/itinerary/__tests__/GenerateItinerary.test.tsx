import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GenerateItinerary from '../GenerateItinerary';
import type { Plan } from '../../../db';

const mockPlan: Plan = {
  id: 'plan-1',
  name: 'Tokyo',
  destination: 'Tokyo',
  startDate: '2025-07-14',
  endDate: '2025-07-20',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  itinerary: [],
  intake: {
    numTravellers: 2,
    kids: false,
    kidAges: null,
    likes: ['sushi', 'temples'],
    dislikes: ['crowds'],
    budgetRange: 'mid',
    flightsBooked: false,
    accommodationBooked: false,
  },
};

describe('GenerateItinerary', () => {
  const onGenerated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders generate button', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByTestId('start-generate-btn')).toBeInTheDocument();
    expect(screen.getByText('Generate Itinerary')).toBeInTheDocument();
  });

  it('shows destination name', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByText(/Tokyo/i)).toBeInTheDocument();
  });

  it('shows budget badge when intake has budget range', () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    expect(screen.getByText(/Budget/i)).toBeInTheDocument();
  });

  it('shows error when no API key configured', async () => {
    // localStorage is cleared — no api key
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));
    await waitFor(() => {
      expect(screen.getByText(/No API key configured/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    render(<MemoryRouter><GenerateItinerary plan={mockPlan} onGenerated={onGenerated} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('start-generate-btn'));
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
