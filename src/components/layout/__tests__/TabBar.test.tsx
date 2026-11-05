import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TabBar from '../TabBar';

describe('TabBar', () => {
  it('renders three tabs', () => {
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/itinerary']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab-itinerary')).toBeInTheDocument();
    expect(screen.getByTestId('tab-essentials')).toBeInTheDocument();
    expect(screen.getByTestId('tab-map')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/itinerary']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    const itineraryTab = screen.getByTestId('tab-itinerary');
    expect(itineraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-essentials')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders tab labels', () => {
    render(
      <MemoryRouter>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Itinerary')).toBeInTheDocument();
    expect(screen.getByText('Essentials')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
  });
});

describe('the order of the tabs', () => {
  // To-Do and Clipboard became one tab, Essentials.
  it('runs itinerary, essentials, map', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.getAllByRole('tab').map(t => t.getAttribute('data-testid')))
      .toEqual(['tab-itinerary', 'tab-essentials', 'tab-map']);
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

// Places are looked up one by one from free services: the map says it is early.
describe('the map tab', () => {
  it('is marked beta, and says so to screen readers', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.getByTestId('tab-map-beta')).toHaveTextContent('Beta');
    expect(screen.getByRole('tab', { name: /map, beta/i })).toBeInTheDocument();
  });

  it('is the only one marked', () => {
    render(<MemoryRouter><TabBar planId="p1" /></MemoryRouter>);
    expect(screen.queryByTestId('tab-itinerary-beta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-essentials-beta')).not.toBeInTheDocument();
  });
});
