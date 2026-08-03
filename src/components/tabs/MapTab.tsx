import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Map, Settings, MapPin } from 'lucide-react';
import { db } from '../../db';
import { getDayColor } from '../../constants/colors';
import {
  getMapboxToken,
  geocodePlanActivities,
  getPinActivities,
  type PinActivity,
} from '../../services/mapbox';
import Toast from '../ui/Toast';
import MapboxMap from '../map/MapboxMap';

interface Props {
  planId: string;
}

export default function MapTab({ planId }: Props) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const geocodedRef = useRef<string | null>(null); // track last geocoded planId+updatedAt
  const mapboxToken = getMapboxToken();

  // Auto-select Day 1 (dayIndex 0) on plan open
  useEffect(() => {
    if (plan?.itinerary?.length) {
      setSelectedDayIndex(0);
    }
  }, [planId]);

  // Geocode unresolved activities
  const triggerGeocoding = useCallback(async () => {
    if (!plan || !mapboxToken) return;
    const cacheKey = `${plan.id}:${plan.updatedAt}`;
    if (geocodedRef.current === cacheKey) return; // already geocoded this version
    geocodedRef.current = cacheKey;

    const unresolved = plan.itinerary
      .flatMap(d => d.activities)
      .filter(a => a.locationName && !a.coordinates);

    if (unresolved.length === 0) return;

    setGeocoding(true);
    setGeocodeError(null);
    const failed = await geocodePlanActivities(plan, mapboxToken, (name) => {
      setToast({ msg: `Could not locate: ${name}` });
    });
    setGeocoding(false);

    if (failed.size > 0) {
      setGeocodeError(`${failed.size} location(s) could not be resolved`);
    }
  }, [plan, mapboxToken]);

  useEffect(() => {
    if (plan) triggerGeocoding();
  }, [plan, triggerGeocoding]);

  // Loading state
  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  // No Mapbox token
  if (!mapboxToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <Map size={48} className="text-accent-muted mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink-primary mb-2">Configure Mapbox Token</h2>
        <p className="text-sm text-ink-secondary mb-4">
          A Mapbox token is required to display the map and geocode locations.
        </p>
        <a
          href="/settings"
          className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Settings size={16} aria-hidden="true" />
          Open Settings
        </a>
      </div>
    );
  }

  // No itinerary
  if (!plan.itinerary?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <MapPin size={48} className="text-accent-muted mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink-primary mb-2">No Itinerary Yet</h2>
        <p className="text-sm text-ink-secondary">
          Generate an itinerary first to see your route on the map.
        </p>
      </div>
    );
  }

  const pins = getPinActivities(plan);
  const hasCoordinates = pins.length > 0;
  const allActivities = plan.itinerary.flatMap(d => d.activities);
  const hasUnresolved = allActivities.some(a => a.locationName && !a.coordinates);

  const selectedDay =
    selectedDayIndex !== null
      ? plan.itinerary.find(d => d.dayIndex === selectedDayIndex)
      : null;

  const selectedDayPins = selectedDayIndex !== null
    ? pins.filter(p => p.dayIndex === selectedDayIndex)
    : pins;

  const allCoordsForDay = selectedDay
    ? selectedDay.activities.filter(a => a.locationName).length > 0 &&
      selectedDay.activities.filter(a => a.locationName && !a.coordinates).length ===
        selectedDay.activities.filter(a => a.locationName).length
    : false;

  return (
    <div className="flex flex-col h-full" data-testid="map-tab">
      {/* Day selector */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 overflow-x-auto shrink-0">
        <button
          onClick={() => { setSelectedDayIndex(null); setDistance(null); }}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedDayIndex === null
              ? 'bg-accent text-ink-inverse border-accent font-semibold'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          data-testid="day-selector-all"
        >
          All days
        </button>
        {plan.itinerary.map(day => {
          const color = getDayColor(day.dayIndex);
          const isSelected = selectedDayIndex === day.dayIndex;
          return (
            <button
              key={day.dayIndex}
              onClick={() => setSelectedDayIndex(day.dayIndex)}
              style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                isSelected
                  ? 'text-white font-semibold'
                  : 'border-white/10 text-ink-secondary hover:text-ink-primary'
              }`}
              data-testid={`day-selector-${day.dayIndex}`}
            >
              {day.label.split(' — ')[0]}
            </button>
          );
        })}

        {geocoding && (
          <span className="shrink-0 flex items-center gap-1 text-xs text-ink-muted ml-auto">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Geocoding…
          </span>
        )}
      </div>

      {/* Map container */}
      <div className="flex-1 relative min-h-0">
        {/* No coordinates warning */}
        {allCoordsForDay && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-surface-overlay border border-white/10 rounded-xl px-4 py-2 text-xs text-ink-secondary shadow-glass" role="status">
            Locations not yet resolved — geocoding in progress
          </div>
        )}

        {!hasCoordinates && !geocoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10 bg-surface-base/80">
            <MapPin size={36} className="text-accent-muted mb-3" aria-hidden="true" />
            <p className="text-sm text-ink-secondary">
              {hasUnresolved
                ? 'Geocoding activity locations…'
                : 'No locations found in your itinerary. Add location names to activities.'}
            </p>
          </div>
        )}

        <MapboxMap
          key={`${planId}-${mapboxToken}`}
          plan={plan}
          token={mapboxToken}
          selectedDayIndex={selectedDayIndex}
          pins={pins}
          onDistanceChange={setDistance}
          onPinClick={(_pin: PinActivity) => {
            // Pin click handled in MapboxMap via popup
          }}
        />
      </div>

      {/* Bottom info strip */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 shrink-0 text-xs">
        {selectedDayIndex !== null && selectedDay ? (
          <>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getDayColor(selectedDayIndex) }}
              aria-hidden="true"
            />
            <span className="text-ink-secondary">{selectedDay.label}</span>
            <span className="text-ink-muted">·</span>
            {selectedDayPins.length === 0 ? (
              <span className="text-ink-muted">No geocoded locations</span>
            ) : selectedDayPins.length === 1 ? (
              <span className="text-ink-muted">Single stop — no route to draw</span>
            ) : distance !== null ? (
              <span className="text-accent font-medium">
                ~{distance.toFixed(1)} km straight-line distance
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-ink-muted">
            {pins.length} location{pins.length !== 1 ? 's' : ''} across {plan.itinerary.length} day{plan.itinerary.length !== 1 ? 's' : ''}
          </span>
        )}
        {geocodeError && (
          <span className="ml-auto text-status-warning text-xs">{geocodeError}</span>
        )}
      </div>

      {toast && <Toast message={toast.msg} onDismiss={() => setToast(null)} />}
    </div>
  );
}
