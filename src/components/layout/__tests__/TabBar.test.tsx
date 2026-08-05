import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TabBar from '../TabBar';
import { useAppStore } from '../../../store';

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

  it('syncs the store activeTab from the current URL on mount', async () => {
    useAppStore.setState({ activeTab: 'itinerary' });
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/map']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(useAppStore.getState().activeTab).toBe('map');
    });
  });

  it('updates the store activeTab when a different tab is clicked', async () => {
    useAppStore.setState({ activeTab: 'itinerary' });
    render(
      <MemoryRouter initialEntries={['/plan/test-plan-id/itinerary']}>
        <TabBar planId="test-plan-id" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('tab-clipboard'));
    await waitFor(() => {
      expect(useAppStore.getState().activeTab).toBe('clipboard');
    });
  });
});
