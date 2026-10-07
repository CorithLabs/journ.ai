import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutJournai from '../AboutJournai';

/*
 * The app once said "Everything stays on this device", and then began sending
 * place names to look up maps, photos and weather. The promise has to name
 * where things go.
 */
describe('what the app says about privacy', () => {
  it('names the services place names go to, and the AI provider', () => {
    render(<AboutJournai />);
    const text = screen.getByTestId('about-journai').textContent ?? '';
    expect(text).toMatch(/OpenStreetMap/);
    expect(text).toMatch(/Wikipedia/);
    expect(text).toMatch(/Open-Meteo/);
    expect(text).toMatch(/provider you chose/);
    expect(text).not.toMatch(/stays on this device/i);
  });
});
