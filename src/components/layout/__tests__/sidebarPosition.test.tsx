import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Sidebar from '../Sidebar';

vi.mock('dexie-react-hooks');
const setWidth = (w: number) => vi.stubGlobal('innerWidth', w);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(useLiveQuery).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Tailwind emits .fixed before .relative, so at equal specificity a base
 * `relative` beats the mobile `fixed` and the sidebar stops overlaying —
 * it becomes an in-flow 240px column that crushes the page to ~150px on a
 * phone. The two position utilities must never appear together.
 */
describe('Sidebar positioning', () => {
  const classesOf = () => screen.getByTestId('sidebar').className;

  it('never applies relative and fixed at the same time', () => {
    setWidth(375);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    // Expand it — this is the state that must overlay on mobile.
    fireEvent.click(screen.getByLabelText(/expand sidebar|collapse sidebar/i));
    const cls = classesOf();
    if (/\bfixed\b/.test(cls)) {
      expect(cls).not.toMatch(/(^|\s)relative(\s|$)/);
    }
  });

  it('overlays rather than taking flow width when expanded on mobile', () => {
    setWidth(375);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText(/expand sidebar|collapse sidebar/i));
    expect(classesOf()).toMatch(/\bfixed\b/);
    expect(classesOf()).toMatch(/md:relative/);
  });

  it('is positioned when collapsed, so it stacks above the ambient layer', () => {
    setWidth(375);
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(classesOf()).toMatch(/(^|\s)relative(\s|$)/);
    expect(classesOf()).not.toMatch(/\bfixed\b/);
  });
});
