import {
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Cloud,
  Thermometer,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { type WeatherDay } from '../../store';
import { type WeatherAlert, detectAlerts } from '../../utils/weatherUtils';
import { type Day } from '../../db';

interface Props {
  weather: WeatherDay;
  day: Day;
  allDays: Day[];
  allWeather: Record<string, WeatherDay>;
  planStartDate: string;
  intake?: {
    likes: string[];
    dislikes: string[];
    kids: boolean | null;
    kidAges: number[] | null;
    budgetRange: 'budget' | 'mid' | 'premium' | 'luxury' | null;
  } | null;
  onGetSuggestions: (prompt: string) => void;
  isOffline: boolean;
}

function AlertIcon({ icon, size = 12 }: { icon: string; size?: number }) {
  switch (icon) {
    case 'CloudRain':
      return <CloudRain size={size} aria-hidden="true" />;
    case 'CloudSnow':
      return <CloudSnow size={size} aria-hidden="true" />;
    case 'CloudLightning':
      return <CloudLightning size={size} aria-hidden="true" />;
    case 'Wind':
      return <Wind size={size} aria-hidden="true" />;
    case 'Cloud':
      return <Cloud size={size} aria-hidden="true" />;
    case 'Thermometer':
      return <Thermometer size={size} aria-hidden="true" />;
    default:
      return null;
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const BUDGET_LABELS: Record<string, string> = {
  budget: 'budget (< $100/person/day)',
  mid: 'mid ($100–$300/person/day)',
  premium: 'premium ($300–$600/person/day)',
  luxury: 'luxury ($600+/person/day)',
};

export default function WeatherAlertBadge({
  weather,
  day,
  allDays,
  allWeather,
  planStartDate,
  intake,
  onGetSuggestions,
  isOffline,
}: Props) {
  const alerts = detectAlerts(weather);
  if (alerts.length === 0) return null;

  const buildPrompt = (): string => {
    const alertDescriptions = alerts.map(a => `${a.emoji} ${a.label}`).join(', ');

    const affectedActivities = day.activities
      .map(a => `  - ${a.time} ${a.name} at ${a.locationName}`)
      .join('\n');

    const otherDaysSummary = allDays
      .filter(d => d.dayIndex !== day.dayIndex)
      .map(d => {
        const date = addDays(planStartDate, d.dayIndex);
        const dWeather = allWeather[date];
        const weatherDesc = dWeather
          ? `${dWeather.tempMax}°C, ${dWeather.precipProbability}% rain`
          : 'no forecast';
        const activities = d.activities
          .map(a => `${a.time} ${a.name}`)
          .join(', ');
        return `  ${d.label}: ${weatherDesc} — ${activities || 'no activities'}`;
      })
      .join('\n');

    const kidsNote =
      intake?.kids && intake.kidAges?.length
        ? `Kids travelling (ages: ${intake.kidAges.join(', ')}). All suggestions must be age-appropriate.`
        : intake?.kids
        ? 'Kids travelling (ages unknown). All suggestions must be family-friendly.'
        : '';

    const budgetNote = intake?.budgetRange
      ? `Budget: ${BUDGET_LABELS[intake.budgetRange] ?? intake.budgetRange}`
      : '';

    const likesNote =
      intake?.likes?.length ? `Likes: ${intake.likes.join(', ')}` : '';
    const dislikesNote =
      intake?.dislikes?.length ? `Dislikes: ${intake.dislikes.join(', ')}` : '';

    return [
      `Weather alert for ${day.label}: ${alertDescriptions}.`,
      `Temp: ${weather.tempMax}°C / ${weather.tempMin}°C, precipitation: ${weather.precipProbability}%, wind: ${weather.windspeedMax} km/h.`,
      '',
      `Affected activities on ${day.label}:`,
      affectedActivities || '  (no activities yet)',
      '',
      `Other days in the itinerary:`,
      otherDaysSummary || '  (no other days)',
      '',
      likesNote,
      dislikesNote,
      kidsNote,
      budgetNote,
      '',
      `Please evaluate these two strategies in order:`,
      `1. DAY SWAP: If another day has acceptable weather (low rain probability, no severe alerts) AND no confirmed bookings, suggest swapping the full activity lists of the two days.`,
      `2. ACTIVITY ALTERNATIVES: If a swap is not possible, suggest indoor or weather-appropriate alternatives for each affected outdoor activity. Alternatives must respect the user's likes/dislikes, be age-appropriate if kids are present, and stay within the budget range.`,
      `For each suggestion, indicate whether it may exceed the budget (budgetWarning: true).`,
      `Format each suggestion clearly as either "DAY SWAP: ..." or "ALTERNATIVE: [original activity] → [suggested replacement]".`,
    ]
      .filter(Boolean)
      .join('\n');
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-status-warning/10 border border-status-warning/20 mt-1 mb-2"
      data-testid="weather-alert-badge"
    >
      {/* Alert badges */}
      <div className="flex flex-wrap gap-1.5">
        {alerts.map((alert: WeatherAlert) => (
          <span
            key={alert.label}
            className="flex items-center gap-1 text-xs font-semibold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full"
            aria-label={`Weather alert: ${alert.label}`}
          >
            <AlertIcon icon={alert.icon} />
            {alert.emoji} {alert.label}
          </span>
        ))}
      </div>

      {/* Get AI suggestions button */}
      {isOffline ? (
        <button
          disabled
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-xl border border-white/10 text-ink-muted cursor-not-allowed"
          title="AI unavailable offline"
          aria-disabled="true"
        >
          <WifiOff size={12} aria-hidden="true" />
          AI unavailable offline
        </button>
      ) : (
        <button
          onClick={() => onGetSuggestions(buildPrompt())}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-xl bg-accent hover:bg-accent-light text-ink-inverse font-semibold transition-colors"
          data-testid="get-ai-suggestions-btn"
          aria-label="Get AI suggestions for this weather alert"
        >
          <Sparkles size={12} aria-hidden="true" />
          Get AI suggestions
        </button>
      )}
    </div>
  );
}
