import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { type Plan, type Day, type Activity, db } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import Toast from '../ui/Toast';
import { suggestionReason } from '../../utils/plainText';

export interface Suggestion {
  id: string;
  type: 'swap' | 'alternative';
  /** For swap: the dayIndex to swap with */
  swapDayIndex?: number;
  /** For alternative: the activity to replace */
  originalActivity?: Activity;
  originalDayIndex?: number;
  /** The replacement activity (for alternative) or null (for swap) */
  replacement?: Partial<Activity>;
  description: string;
  budgetWarning: boolean;
}

interface Props {
  plan: Plan;
  affectedDayIndex: number;
  suggestions: Suggestion[];
  onClose: () => void;
  onToast: (msg: string, undo?: () => void) => void;
}

/**
 * Parse raw AI text into structured suggestions.
 * Looks for lines starting with "DAY SWAP:" or "ALTERNATIVE:".
 */
export function parseSuggestions(aiText: string, plan: Plan, affectedDayIndex: number): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const lines = aiText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Day swap suggestion
    if (trimmed.toLowerCase().startsWith('day swap:')) {
      const desc = trimmed.slice('day swap:'.length).trim();
      // Try to find which day index is being suggested
      let swapDayIndex: number | undefined;
      for (const day of plan.itinerary) {
        if (day.dayIndex !== affectedDayIndex && desc.toLowerCase().includes(day.label.toLowerCase())) {
          swapDayIndex = day.dayIndex;
          break;
        }
        // Also try "Day N" pattern
        const match = desc.match(/\bday\s+(\d+)\b/i);
        if (match) {
          const num = parseInt(match[1], 10) - 1; // convert 1-based to 0-based
          if (num >= 0 && num < plan.itinerary.length && num !== affectedDayIndex) {
            swapDayIndex = num;
            break;
          }
        }
      }
      suggestions.push({
        id: uuidv4(),
        type: 'swap',
        swapDayIndex,
        description: desc,
        budgetWarning: false,
      });
    }

    // Activity alternative suggestion
    if (trimmed.toLowerCase().startsWith('alternative:')) {
      const rest = trimmed.slice('alternative:'.length).trim();
      const arrowIdx = rest.indexOf('→');
      const budgetWarning =
        rest.toLowerCase().includes('budget warning') ||
        rest.toLowerCase().includes('may exceed');
      const description = rest;

      if (arrowIdx !== -1) {
        const originalName = rest.slice(0, arrowIdx).trim();
        const replacementName = rest.slice(arrowIdx + 1).trim().replace(/\s*\(budget warning\)/i, '').trim();

        // Find the original activity
        const affectedDay = plan.itinerary.find(d => d.dayIndex === affectedDayIndex);
        const originalActivity = affectedDay?.activities.find(a =>
          a.name.toLowerCase().includes(originalName.toLowerCase()) ||
          originalName.toLowerCase().includes(a.name.toLowerCase()),
        );

        suggestions.push({
          id: uuidv4(),
          type: 'alternative',
          originalActivity,
          originalDayIndex: affectedDayIndex,
          replacement: {
            id: uuidv4(),
            name: replacementName,
            time: originalActivity?.time ?? '09:00',
            locationName: '',
            notes: '',
            pinnedToTodo: false,
            budgetWarning,
          },
          description,
          budgetWarning,
        });
      } else {
        suggestions.push({
          id: uuidv4(),
          type: 'alternative',
          originalDayIndex: affectedDayIndex,
          description,
          budgetWarning,
        });
      }
    }
  }

  // If no structured suggestions found, create a generic one
  if (suggestions.length === 0 && aiText.trim()) {
    suggestions.push({
      id: uuidv4(),
      type: 'alternative',
      originalDayIndex: affectedDayIndex,
      description: aiText.trim(),
      budgetWarning: false,
    });
  }

  return suggestions;
}

/** A named thing in the change: a day, or an activity. */
function Pill({ children, accent = false }: { children: string; accent?: boolean }) {
  return (
    <span
      className={`inline-block max-w-[45%] truncate text-xs font-medium px-2 py-1 rounded-full border ${
        accent
          ? 'bg-accent/15 border-accent/40 text-ink-primary'
          : 'bg-surface-overlay border-white/10 text-ink-secondary'
      }`}
      title={children}
    >
      {children}
    </span>
  );
}

/** What is being moved or replaced. */
function fromLabel(plan: Plan, affectedDayIndex: number, s: Suggestion): string {
  if (s.type === 'swap') {
    return plan.itinerary.find((d) => d.dayIndex === affectedDayIndex)?.label ?? `Day ${affectedDayIndex + 1}`;
  }
  return s.originalActivity?.name ?? 'This activity';
}

/** What it becomes. */
function toLabel(plan: Plan, s: Suggestion): string {
  if (s.type === 'swap') {
    return s.swapDayIndex !== undefined
      ? plan.itinerary.find((d) => d.dayIndex === s.swapDayIndex)?.label ?? `Day ${s.swapDayIndex + 1}`
      : 'another day';
  }
  return s.replacement?.name ?? 'something indoors';
}

export default function WeatherSuggestionsPanel({
  plan,
  affectedDayIndex,
  suggestions: initialSuggestions,
  onClose,
  onToast,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const accept = async (suggestion: Suggestion) => {
    if (suggestion.type === 'swap' && suggestion.swapDayIndex !== undefined) {
      // Perform day swap
      const affDay = plan.itinerary.find(d => d.dayIndex === affectedDayIndex);
      const swapDay = plan.itinerary.find(d => d.dayIndex === suggestion.swapDayIndex);

      if (affDay && swapDay) {
        const originalAffActivities = [...affDay.activities];
        const originalSwapActivities = [...swapDay.activities];

        const newItinerary = plan.itinerary.map(d => {
          if (d.dayIndex === affectedDayIndex) return { ...d, activities: originalSwapActivities };
          if (d.dayIndex === suggestion.swapDayIndex) return { ...d, activities: originalAffActivities };
          return d;
        });

        await db.plans.update(plan.id, { itinerary: newItinerary, updatedAt: new Date().toISOString() });

        const undo = async () => {
          await db.plans.update(plan.id, { itinerary: plan.itinerary, updatedAt: new Date().toISOString() });
        };
        onToast('Day swap applied', undo);
      }
    } else if (suggestion.type === 'alternative' && suggestion.originalActivity && suggestion.replacement) {
      // Replace the original activity with the alternative
      const newItinerary = plan.itinerary.map(d => {
        if (d.dayIndex !== suggestion.originalDayIndex) return d;
        return {
          ...d,
          activities: d.activities.map(a =>
            a.id === suggestion.originalActivity!.id
              ? { ...a, ...suggestion.replacement, id: a.id }
              : a,
          ),
        };
      });

      await db.plans.update(plan.id, { itinerary: newItinerary, updatedAt: new Date().toISOString() });

      const undo = async () => {
        await db.plans.update(plan.id, { itinerary: plan.itinerary, updatedAt: new Date().toISOString() });
      };
      onToast(`Replaced "${suggestion.originalActivity.name}"`, undo);
    }

    setAccepted(s => new Set([...s, suggestion.id]));
  };

  const reject = (suggestionId: string) => {
    setRejected(s => new Set([...s, suggestionId]));
  };

  const activeSuggestions = suggestions.filter(s => !accepted.has(s.id) && !rejected.has(s.id));
  // Answering the last one must not leave the carousel pointing past the end.
  const safeIndex = Math.min(index, Math.max(0, activeSuggestions.length - 1));
  const shown = activeSuggestions.length ? [activeSuggestions[safeIndex]] : [];

  if (activeSuggestions.length === 0) {
    return (
      <div className="bg-surface-overlay border border-white/10 rounded-card p-4 mt-2" data-testid="weather-suggestions-panel">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-ink-primary">AI Suggestions</span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary" aria-label="Close suggestions">
            <XCircle size={16} />
          </button>
        </div>
        <p className="text-sm text-ink-secondary">All suggestions have been reviewed.</p>
      </div>
    );
  }

  return (
    <div
      className="bg-surface-overlay border border-white/10 rounded-card p-4 mt-2 space-y-3"
      data-testid="weather-suggestions-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" aria-hidden="true" />
          <span className="text-sm font-medium text-ink-primary">AI Weather Suggestions</span>
        </div>
        <button
          onClick={onClose}
          className="text-ink-muted hover:text-ink-primary"
          aria-label="Close suggestions panel"
        >
          <XCircle size={16} />
        </button>
      </div>

      {/* One at a time when there are several: three cards of prose in a
          panel this size is a wall, and only one of them can be acted on
          first anyway. */}
      {activeSuggestions.length > 1 && (
        <div className="flex items-center justify-between" data-testid="suggestion-carousel">
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={safeIndex === 0}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Previous suggestion"
            data-testid="suggestion-prev"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {activeSuggestions.map((sg, i) => (
              <span
                key={sg.id}
                className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-4 bg-accent' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
          <span className="sr-only" role="status">
            Suggestion {safeIndex + 1} of {activeSuggestions.length}
          </span>
          <button
            onClick={() => setIndex(i => Math.min(activeSuggestions.length - 1, i + 1))}
            disabled={safeIndex >= activeSuggestions.length - 1}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Next suggestion"
            data-testid="suggestion-next"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {shown.map(suggestion => (
          <div
            key={suggestion.id}
            className="bg-surface-raised border border-white/5 rounded-card p-3"
            data-testid="suggestion-card"
          >
            {/* Type badge */}
            <div className="flex items-start gap-2 mb-2">
              <span
                className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  suggestion.type === 'swap'
                    ? 'text-accent bg-accent/10'
                    : 'text-status-info bg-accent/10'
                }`}
              >
                {suggestion.type === 'swap' ? '🔄 Day Swap' : '🔁 Alternative'}
              </span>
              {suggestion.budgetWarning && (
                <span
                  className="flex items-center gap-1 text-xs font-semibold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full"
                  aria-label="Budget warning"
                >
                  <AlertTriangle size={10} aria-hidden="true" />
                  Budget warning
                </span>
              )}
            </div>

            {/* The change itself, as the two things and the move between
                them. This was the raw model text, markdown marks and all,
                printed into the card. */}
            <div className="flex items-center gap-2 flex-wrap mb-2" data-testid="suggestion-change">
              <Pill>{fromLabel(plan, affectedDayIndex, suggestion)}</Pill>
              <ArrowRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
              <Pill accent>{toLabel(plan, suggestion)}</Pill>
            </div>

            {suggestionReason(suggestion.description) && (
              <p className="text-xs text-ink-secondary mb-3" data-testid="suggestion-reason">
                {suggestionReason(suggestion.description)}
              </p>
            )}

            {/* Accept / reject */}
            <div className="flex gap-2">
              <button
                onClick={() => accept(suggestion)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-status-success/10 text-status-success border border-status-success/20 hover:bg-status-success/20 transition-colors"
                data-testid="accept-suggestion-btn"
                aria-label="Accept suggestion"
              >
                <CheckCircle2 size={12} aria-hidden="true" />
                Accept
              </button>
              <button
                onClick={() => reject(suggestion.id)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-surface-overlay text-ink-muted border border-white/10 hover:text-status-danger hover:border-status-danger/20 transition-colors"
                data-testid="reject-suggestion-btn"
                aria-label="Reject suggestion"
              >
                <XCircle size={12} aria-hidden="true" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
