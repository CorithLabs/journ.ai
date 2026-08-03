import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IntakeChat from '../IntakeChat';
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
};

describe('IntakeChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the opening question about number of travellers', () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByText(/How many people are travelling/i)).toBeInTheDocument();
  });

  it('shows input field for answers', () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    expect(screen.getByTestId('intake-input')).toBeInTheDocument();
  });

  it('advances to kids question after entering traveller count', async () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    fireEvent.change(screen.getByTestId('intake-input'), { target: { value: '2' } });
    fireEvent.submit(screen.getByTestId('intake-input').closest('form')!);
    await waitFor(() => {
      expect(screen.getByText(/children/i)).toBeInTheDocument();
    });
  });

  it('shows budget quick-select buttons when on budget step', async () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    // Walk through steps: travellers -> kids -> likes -> dislikes -> budget
    const sendAnswer = async (answer: string) => {
      fireEvent.change(screen.getByTestId('intake-input'), { target: { value: answer } });
      fireEvent.submit(screen.getByTestId('intake-input').closest('form')!);
      await new Promise(r => setTimeout(r, 50));
    };
    await sendAnswer('2');
    await sendAnswer('no');
    await sendAnswer('hiking, food');
    await sendAnswer('skip');
    await waitFor(() => {
      expect(screen.getByText(/Budget/i)).toBeInTheDocument();
    });
  });
});
