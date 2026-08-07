import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import PlanBreadcrumb from '../PlanBreadcrumb';
import Sidebar from '../Sidebar';
import { useAppStore } from '../../../store';
import { setViewport, PHONE, DESKTOP } from '../../../test/viewport';

vi.mock('dexie-react-hooks');

const plan = {
  id: 'p1', name: 'Ottawa', destination: 'Ottawa, Canada',
  startDate: '2025-08-13', endDate: '2025-08-16',
  createdAt: '', updatedAt: '', deleted: false, itinerary: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAppStore.setState({ activeTab: 'todo' });
});
afterEach(() => vi.unstubAllGlobals());

describe('PlanBreadcrumb', () => {
  // On a phone the sidebar is behind a drawer, so nothing else on screen
  // names the plan being edited.
  it('names the plan and the current tab', () => {
    vi.mocked(useLiveQuery).mockReturnValue(plan);
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    expect(screen.getByText('Ottawa, Canada')).toBeInTheDocument();
    expect(screen.getByText('To-Do')).toBeInTheDocument();
  });

  it('renders nothing while the plan is loading', () => {
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
    const { container } = render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('version badge', () => {
  it('is shown under Settings so a stale cache is obvious', () => {
    setViewport(DESKTOP);
    vi.mocked(useLiveQuery).mockReturnValue([]);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByTestId('app-version')).toHaveTextContent(/^v\d+\.\d+\.\d+/);
  });

  it('is hidden when the rail is collapsed to icons', () => {
    setViewport(PHONE);
    vi.mocked(useLiveQuery).mockReturnValue([]);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    // The phone drawer is full width, so the version is still shown there.
    expect(screen.getByTestId('app-version')).toBeInTheDocument();
  });
});
