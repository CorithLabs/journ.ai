import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TabBar from '../TabBar';

describe('TabBar', () => {
  it('renders four tabs', () => {
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/itinerary']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab-itinerary')).toBeInTheDocument();
    expect(screen.getByTestId('tab-todo')).toBeInTheDocument();
    expect(screen.getByTestId('tab-map')).toBeInTheDocument();
    expect(screen.getByTestId('tab-clipboard')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/itinerary']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    const itineraryTab = screen.getByTestId('tab-itinerary');
    expect(itineraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-todo')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders tab labels', () => {
    render(
      <MemoryRouter>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Itinerary')).toBeInTheDocument();
    expect(screen.getByText('To-Do')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Clipboard')).toBeInTheDocument();
  });
});

describe('the order of the tabs', () => {
  it('runs itinerary, to-do, clipboard, map', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.getAllByRole('tab').map(t => t.textContent))
      .toEqual(['Itinerary', 'To-Do', 'Clipboard', 'Map']);
  });

  // Arrow-key traversal walks the same array, so the two cannot disagree.
  it('moves the keyboard focus in that order too', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
  });
});
