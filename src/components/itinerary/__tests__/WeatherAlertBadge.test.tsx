import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WeatherAlertBadge from '../WeatherAlertBadge';
import { type WeatherDay } from '../../../store';
import { type Day } from '../../../db';

const clearDay: WeatherDay = {
  date: '2025-07-14',
  weatherCode: 0,
  tempMax: 25,
  tempMin: 15,
  precipProbability: 10,
  windspeedMax: 20,
  apparentTempMax: 27,
};

const rainyDay: WeatherDay = {
  date: '2025-07-14',
  weatherCode: 61,
  tempMax: 22,
  tempMin: 14,
  precipProbability: 75,
  windspeedMax: 30,
  apparentTempMax: 23,
};

const stormy: WeatherDay = {
  date: '2025-07-15',
  weatherCode: 95,
  tempMax: 20,
  tempMin: 12,
  precipProbability: 90,
  windspeedMax: 65,
  apparentTempMax: 22,
};

const mockDay: Day = {
  dayIndex: 0,
  label: 'Day 1 — Mon 14 Jul',
  activities: [
    { id: 'a1', name: 'Temple Visit', time: '09:00', locationName: 'Tokyo', notes: '', pinnedToTodo: false },
  ],
};

const mockAllDays: Day[] = [
  mockDay,
  {
    dayIndex: 1,
    label: 'Day 2 — Tue 15 Jul',
    activities: [
      { id: 'a2', name: 'Museum', time: '10:00', locationName: 'Tokyo', notes: '', pinnedToTodo: false },
    ],
  },
];

const mockAllWeather: Record<string, WeatherDay> = {
  '2025-07-14': rainyDay,
  '2025-07-15': clearDay,
};

describe('WeatherAlertBadge', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(
      <WeatherAlertBadge
        weather={clearDay}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={null}
        onGetSuggestions={vi.fn()}
        isOffline={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders rain alert badge for rainy day', () => {
    render(
      <WeatherAlertBadge
        weather={rainyDay}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={null}
        onGetSuggestions={vi.fn()}
        isOffline={false}
      />,
    );
    expect(screen.getByTestId('weather-alert-badge')).toBeTruthy();
    expect(screen.getByText(/Rain \/ Drizzle/)).toBeTruthy();
  });

  it('renders multiple alerts for stormy day with high winds', () => {
    render(
      <WeatherAlertBadge
        weather={stormy}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={null}
        onGetSuggestions={vi.fn()}
        isOffline={false}
      />,
    );
    expect(screen.getByText(/Thunderstorm/)).toBeTruthy();
    expect(screen.getByText(/High winds/)).toBeTruthy();
  });

  it('shows "Get AI suggestions" button when online', () => {
    render(
      <WeatherAlertBadge
        weather={rainyDay}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={null}
        onGetSuggestions={vi.fn()}
        isOffline={false}
      />,
    );
    expect(screen.getByTestId('get-ai-suggestions-btn')).toBeTruthy();
  });

  it('shows "AI unavailable offline" when offline', () => {
    render(
      <WeatherAlertBadge
        weather={rainyDay}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={null}
        onGetSuggestions={vi.fn()}
        isOffline={true}
      />,
    );
    expect(screen.getByText(/AI unavailable offline/)).toBeTruthy();
    expect(screen.queryByTestId('get-ai-suggestions-btn')).toBeNull();
  });

  it('calls onGetSuggestions with a prompt when button is clicked', () => {
    const mockOnGetSuggestions = vi.fn();
    render(
      <WeatherAlertBadge
        weather={rainyDay}
        day={mockDay}
        allDays={mockAllDays}
        allWeather={mockAllWeather}
        planStartDate="2025-07-14"
        intake={{ likes: ['temples'], dislikes: ['crowds'], kids: false, kidAges: null, budgetRange: 'mid' }}
        onGetSuggestions={mockOnGetSuggestions}
        isOffline={false}
      />,
    );
    fireEvent.click(screen.getByTestId('get-ai-suggestions-btn'));
    expect(mockOnGetSuggestions).toHaveBeenCalledOnce();
    const prompt = mockOnGetSuggestions.mock.calls[0][0] as string;
    expect(prompt).toContain('Rain / Drizzle');
    expect(prompt).toContain('Temple Visit');
    expect(prompt).toContain('mid');
  });
});
