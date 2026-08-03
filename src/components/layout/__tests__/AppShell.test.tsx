import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../AppShell';
import { useLiveQuery } from 'dexie-react-hooks';

vi.mock('dexie-react-hooks');
vi.mocked(useLiveQuery).mockReturnValue([]);

describe('AppShell', () => {
  it('renders the app shell with sidebar and main content', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('main content area is flex-1', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    const main = screen.getByTestId('main-content');
    expect(main).toHaveClass('flex-1');
  });
});
