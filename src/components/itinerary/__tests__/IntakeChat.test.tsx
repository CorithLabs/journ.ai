import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

async function sendAnswer(text: string) {
  const input = screen.getByTestId('intake-input');
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });
  const form = input.closest('form');
  if (form) {
    await act(async () => { fireEvent.submit(form); });
  }
}

describe('IntakeChat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
    await sendAnswer('2');
    await waitFor(() => {
      expect(screen.getByText(/children/i)).toBeInTheDocument();
    });
  });

  it('shows budget quick-select buttons after answering likes and dislikes', async () => {
    render(<MemoryRouter><IntakeChat plan={mockPlan} /></MemoryRouter>);
    // travellers
    await sendAnswer('2');
    await waitFor(() => expect(screen.getByText(/children/i)).toBeInTheDocument());
    // kids -> no
    await sendAnswer('no');
    // likes question: "What kinds of activities do you enjoy?"
    await waitFor(() => expect(screen.getByText(/activities do you enjoy/i)).toBeInTheDocument());
    await sendAnswer('hiking');
    // dislikes question
    await waitFor(() => expect(screen.getByText(/avoid/i)).toBeInTheDocument());
    await sendAnswer('skip');
    // budget buttons appear
    await waitFor(() => {
      expect(screen.getByText(/Budget.*\$100/i)).toBeInTheDocument();
    });
  });
});
