import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewPlanModal from '../../plans/NewPlanModal';
import SettingsPage from '../../../pages/SettingsPage';
import * as aiKey from '../../../services/aiKey';

vi.mock('../../../services/aiKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/aiKey')>();
  return {
    ...actual,
    setApiKey: vi.fn().mockResolvedValue(undefined),
    getApiKey: vi.fn().mockResolvedValue(null),
    clearApiKey: vi.fn(),
    hasStoredKey: vi.fn().mockReturnValue(false),
    isCryptoAvailable: vi.fn().mockReturnValue(true),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(aiKey.isCryptoAvailable).mockReturnValue(true);
});

/** The nearest ancestor both fields share. */
const commonRow = (a: HTMLElement, b: HTMLElement) => {
  let node: HTMLElement | null = a;
  while (node && !node.contains(b)) node = node.parentElement;
  return node;
};

/*
 * Two short answers to one question, stacked at full width, read as two
 * unrelated questions — and take the room the long field below them needed.
 */
describe('fields that belong together sit together', () => {
  it('puts the trip dates on one row, the way trip details already did', () => {
    render(<MemoryRouter><NewPlanModal onClose={vi.fn()} /></MemoryRouter>);

    const row = commonRow(
      screen.getByTestId('start-date-input'),
      screen.getByTestId('end-date-input'),
    );

    expect(row?.className).toContain('flex');
    expect(row?.className).toContain('gap-3');
  });

  it('pairs the provider with its model once there is a model to pick', () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByTestId('provider-select'), { target: { value: 'anthropic' } });

    const row = commonRow(
      screen.getByTestId('provider-select'),
      screen.getByTestId('anthropic-model-select'),
    );

    expect(row?.className).toContain('flex');
  });

  /*
   * The sharpest version of the problem: a key of about a hundred characters
   * and a two-option select were both `w-full` in the same 512px column.
   */
  it('leaves the API key the whole row, since it is the longest value here', () => {
    render(<SettingsPage />);

    // The select fills its cell — a control narrower than its cell looks
    // ragged. What differs is the cell: the provider sits in a shared,
    // width-capped one, the key in the form's own full width.
    expect(screen.getByTestId('provider-select').parentElement?.className).toContain('flex-1');
    expect(screen.getByTestId('provider-select').parentElement?.className).toContain('min-w-');
    expect(screen.getByTestId('api-key-input').parentElement?.className ?? '').not.toContain('flex-1');
  });

  it('still shows the provider on its own when there is no model to pair it with', () => {
    render(<SettingsPage />);

    expect(screen.getByTestId('provider-select')).toBeInTheDocument();
    expect(screen.queryByTestId('anthropic-model-select')).not.toBeInTheDocument();
  });
});
