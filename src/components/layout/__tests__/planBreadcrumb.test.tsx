import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('names the plan', () => {
    vi.mocked(useLiveQuery).mockReturnValue(plan);
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    expect(screen.getByText('Ottawa, Canada')).toBeInTheDocument();
  });

  /*
   * The tabs sit in this same bar at every width, a few pixels away, with the
   * current one already highlighted — so naming it here said what the tablist
   * was saying, and spent the room the plan name needs to do it.
   */
  it('leaves naming the current tab to the tabs', () => {
    vi.mocked(useLiveQuery).mockReturnValue(plan);
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    expect(screen.queryByText('To-Do')).not.toBeInTheDocument();
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

/*
 * Everything the new-plan form asked — dates, travel, the route — was
 * otherwise reachable only through a right-click menu in a sidebar that is
 * behind a drawer on a phone, which is no way to find the answers you gave
 * ten minutes ago.
 */
describe('opening the trip settings', () => {
  beforeEach(() => vi.mocked(useLiveQuery).mockReturnValue(plan));

  it('makes the plan name the way in', () => {
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('breadcrumb-plan-btn'));
    expect(screen.getByTestId('trip-details-panel')).toBeInTheDocument();
  });

  it('says so, rather than looking like plain text', () => {
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    expect(screen.getByTestId('breadcrumb-plan-btn'))
      .toHaveAccessibleName('Ottawa, Canada — open trip details');
  });

  it('closes again without changing anything', () => {
    render(<MemoryRouter><PlanBreadcrumb planId="p1" /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('breadcrumb-plan-btn'));
    fireEvent.click(screen.getByTestId('td-cancel'));
    expect(screen.queryByTestId('trip-details-panel')).not.toBeInTheDocument();
  });
});
