import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlanContextMenu from '../PlanContextMenu';
import { db } from '../../../db';

describe('PlanContextMenu', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.plans.get).mockResolvedValue({
      id: 'plan-1',
      name: 'Tokyo',
      destination: 'Tokyo',
      startDate: '2025-07-14',
      endDate: '2025-07-20',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
      itinerary: [],
    });
  });

  it('renders menu options', () => {
    render(
      <MemoryRouter>
        <PlanContextMenu planId="plan-1" x={100} y={100} onClose={onClose} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('menuitem', { name: /Rename/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete/i })).toBeInTheDocument();
  });

  it('shows confirm dialog on delete click', async () => {
    render(
      <MemoryRouter>
        <PlanContextMenu planId="plan-1" x={100} y={100} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/i }));
    await waitFor(() => {
      expect(screen.getByText('Delete this plan?')).toBeInTheDocument();
    });
  });

  it('calls db.plans.update on delete confirm', async () => {
    render(
      <MemoryRouter>
        <PlanContextMenu planId="plan-1" x={100} y={100} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/i }));
    await waitFor(() => expect(screen.getByText('Delete this plan?')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => {
      expect(db.plans.update).toHaveBeenCalledWith('plan-1', expect.objectContaining({ deleted: true }));
    });
  });

  it('calls db.plans.add on duplicate', async () => {
    render(
      <MemoryRouter>
        <PlanContextMenu planId="plan-1" x={100} y={100} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate/i }));
    await waitFor(() => {
      expect(db.plans.add).toHaveBeenCalledWith(
        expect.objectContaining({ destination: 'Tokyo (copy)' }),
      );
    });
  });
});
