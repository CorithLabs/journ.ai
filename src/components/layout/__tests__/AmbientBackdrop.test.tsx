import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AmbientBackdrop from '../AmbientBackdrop';

describe('AmbientBackdrop', () => {
  it('renders the three light forms', () => {
    const { container } = render(<AmbientBackdrop />);
    expect(container.querySelectorAll('.ambient__form')).toHaveLength(3);
  });

  // Purely decorative: it sits over the whole viewport, so if it were ever
  // interactive it would swallow every click in the app.
  it('is inert and hidden from assistive technology', () => {
    render(<AmbientBackdrop />);
    const el = screen.getByTestId('ambient-backdrop');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('ambient');
  });
});
