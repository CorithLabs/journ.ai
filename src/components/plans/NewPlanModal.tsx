import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import type { Plan } from '../../db';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function NewPlanModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!destination.trim()) {
      errs.destination = 'Destination is required';
    }
    if (startDate && endDate && endDate < startDate) {
      errs.endDate = 'End date must be after start date';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const plan: Plan = {
        id: uuidv4(),
        name: destination.trim(),
        destination: destination.trim(),
        startDate: startDate || now.split('T')[0],
        endDate: endDate || now.split('T')[0],
        createdAt: now,
        updatedAt: now,
        deleted: false,
        itinerary: [],
      };
      await db.plans.add(plan);
      navigate(`/plan/${plan.id}/itinerary`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="w-full max-w-md bg-surface-overlay border border-white/10 rounded-modal shadow-glass p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-plan-title"
      data-testid="new-plan-modal"
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          id="new-plan-title"
          className="text-lg font-semibold text-ink-primary"
        >
          New Trip
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-raised transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Close modal"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="destination"
            className="block text-sm text-ink-secondary mb-1"
          >
            Destination <span className="text-status-danger">*</span>
          </label>
          <input
            id="destination"
            type="text"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              if (errors.destination) setErrors((prev) => ({ ...prev, destination: '' }));
            }}
            placeholder="e.g. Tokyo, Japan"
            className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            aria-required="true"
            aria-describedby={errors.destination ? 'destination-error' : undefined}
            data-testid="destination-input"
          />
          {errors.destination && (
            <p
              id="destination-error"
              role="alert"
              className="mt-1 text-xs text-status-danger"
            >
              {errors.destination}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="start-date"
            className="block text-sm text-ink-secondary mb-1"
          >
            Start Date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            data-testid="start-date-input"
          />
        </div>

        <div>
          <label
            htmlFor="end-date"
            className="block text-sm text-ink-secondary mb-1"
          >
            End Date
          </label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: '' }));
            }}
            className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            aria-describedby={errors.endDate ? 'end-date-error' : undefined}
            data-testid="end-date-input"
          />
          {errors.endDate && (
            <p
              id="end-date-error"
              role="alert"
              className="mt-1 text-xs text-status-danger"
            >
              {errors.endDate}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-accent hover:bg-accent-light disabled:opacity-60 text-ink-inverse font-semibold px-4 py-2.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none text-sm"
          data-testid="create-plan-btn"
        >
          {saving ? 'Creating…' : 'Create Plan'}
        </button>
      </form>
    </div>
  );
}
