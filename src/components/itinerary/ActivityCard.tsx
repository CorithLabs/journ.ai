import { useState } from 'react';
import Button from '../ui/Button';
import { AlertTriangle, Pin, Pencil, Trash2, MapPin, MapPinOff } from 'lucide-react';
import { type Activity, type Plan } from '../../db';
import {
  formatTime,
  slotLabel,
  slotForTime,
  exactTime,
  TIME_SLOTS,
  findTimeClashes,
  nextFreeTime,
} from '../../utils/activityTime';
import { mapsUrlFor } from '../../utils/mapsLink';
import { nearbyAnchor, locationContext } from '../../utils/locationSearch';
import { CardActionRail, CardAction } from '../ui/CardActionRail';
import LocationField, { type PickedLocation } from '../ui/LocationField';
import DetailModal, { DetailRow } from '../ui/DetailModal';

/**
 * Why an activity is missing from the map, if it is.
 *
 * Three states, and only two of them are worth saying out loud. Geocoding runs
 * when the Map tab is opened, so an activity with no coordinates has usually
 * just not been looked at yet — flagging that would accuse a whole fresh
 * itinerary of being broken. `locationUnresolved` is the difference: it is set
 * only after a lookup came back empty.
 *
 * The two that are worth saying need different repairs, which is why they are
 * not one badge: one is missing a location, the other has one that no map
 * knows.
 */
export function mapGapFor(
  act: Pick<Activity, 'locationName' | 'coordinates' | 'locationUnresolved'>,
): { kind: 'missing' | 'unresolved'; label: string; tone: 'muted' | 'warning' } | null {
  if (act.coordinates) return null;
  if (act.locationUnresolved) {
    return act.locationName?.trim()
      ? { kind: 'unresolved', label: 'Location not found — fix it', tone: 'warning' }
      : { kind: 'missing', label: 'Add a location for the map', tone: 'muted' };
  }
  // Never looked up. Says nothing, because nothing has gone wrong yet.
  return null;
}

/** Morning / Noon / Evening / Night, with the current one lit. */
export function SlotPicker({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  // An exact time lights its own slot, so 15:00 shows as Noon and tapping
  // Noon simply drops the clock value.
  const current = slotForTime(value);
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Time of day">
      {TIME_SLOTS.map(slot => (
        <button
          key={slot.id}
          type="button"
          title={slot.hint}
          onClick={() => onPick(slot.id)}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            current === slot.id
              ? 'bg-accent/15 border-accent/40 text-ink-primary'
              : 'border-white/10 text-ink-secondary hover:text-ink-primary'
          }`}
          aria-pressed={current === slot.id}
          data-testid={`slot-${slot.id}`}
        >
          {slot.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  act: Activity;
  /** The rest of the day, for spotting two activities at the same clock time. */
  siblings?: Activity[];
  plan: Pick<Plan, 'destination' | 'country'>;
  onDel: () => void;
  onUpd: (u: Partial<Activity>) => void;
  onPin: () => void;
}

export default function ActivityCard({ act, plan, siblings = [], onDel, onUpd, onPin }: Props) {
  const mapsUrl = act.locationName?.trim() || act.coordinates ? mapsUrlFor(act, plan) : null;
  /**
   * Closed, showing everything the activity knows, or editing it.
   *
   * One modal in two modes rather than two: reading a card and then correcting
   * what you read is the same errand, and it should not close and reopen in
   * the middle.
   */
  const [detail, setDetail] = useState<null | 'view' | 'edit'>(null);
  /** Set when edit was opened from the map flag rather than the pencil. */
  const [focusLocation, setFocusLocation] = useState(false);
  const [nm, setNm] = useState(act.name);
  const [tm, setTm] = useState(act.time);
  const [loc, setLoc] = useState(act.locationName);
  const [notes, setNotes] = useState(act.notes);
  const [err, setErr] = useState('');
  /*
   * What the location field last resolved to, held until the edit is saved.
   *
   * A picked venue arrives with coordinates; typed text arrives with none,
   * and that absence has to be written through — keeping the old pin after
   * the location was changed left the card naming one place and drawn at
   * another.
   */
  const [picked, setPicked] = useState<PickedLocation>({
    locationName: act.locationName,
    address: act.address,
    coordinates: act.coordinates,
  });
  // The clock is the exception now, so it stays out of the way unless this
  // activity already has one or the user asks for it.
  const [showExact, setShowExact] = useState(Boolean(exactTime(act.time)));

  const clashes = findTimeClashes(siblings, tm, act.id);
  const suggestion = clashes.length ? nextFreeTime(siblings, tm, act.id) : null;
  const mapGap = mapGapFor(act);


  const setLocation = (next: PickedLocation) => {
    setLoc(next.locationName);
    setPicked(next);
  };

  const closeDetail = () => {
    setDetail(null);
    setFocusLocation(false);
  };

  /** Open on the location, from a flag that is about the location. */
  const fixLocation = () => {
    setFocusLocation(true);
    setDetail('edit');
  };

  const save = () => {
    if (!nm.trim()) { setErr('Name cannot be blank'); return; }
    setErr('');
    onUpd({
      name: nm.trim(),
      time: tm,
      locationName: loc,
      notes,
      coordinates: picked.coordinates,
      address: picked.address,
      // A location that has changed has not been looked for yet, whatever
      // happened to the one before it.
      locationUnresolved: false,
    });
  };

  /*
   * Editing happens in the modal now, not in place of the card.
   *
   * An activity opened its editor by turning into one, so the list silently
   * reflowed around a card that had become a form — and the details you were
   * reading were replaced by the fields that hold them.
   */
  const editForm = (
      <div className="space-y-2" data-testid="activity-edit-form">
        <div>
          <input value={nm} onChange={e => setNm(e.target.value)} onBlur={save}
            className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Activity name" placeholder="Activity name" />
          {err && <p className="text-xs text-status-danger mt-0.5">{err}</p>}
        </div>
        <LocationField
          value={loc}
          address={picked.address ?? act.address}
          proximity={nearbyAnchor(siblings, act.id)}
          context={locationContext(plan)}
          onChange={setLocation}
          onBlur={save}
          autoFocus={focusLocation}
          testId="edit-location"
        />

        {/* The part of the day is the time. An exact clock value is available
            below for the few things that have one — a check-in, a flight. */}
        <SlotPicker
          value={tm}
          onPick={next => { setTm(next); onUpd({ time: next }); }}
        />

        {showExact ? (
          <div className="flex items-center gap-2">
            <input type="time" value={exactTime(tm) ?? ''} onChange={e => setTm(e.target.value)} onBlur={save}
              className="bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none"
              aria-label="Exact time" data-testid="edit-time" />
            <button type="button" className="text-xs text-ink-muted hover:underline"
              onClick={() => { setShowExact(false); const slot = slotForTime(tm); if (slot) { setTm(slot); onUpd({ time: slot }); } }}>
              Clear
            </button>
          </div>
        ) : (
          <button type="button" className="text-xs text-ink-muted hover:text-accent"
            onClick={() => setShowExact(true)} data-testid="show-exact-time">
            + Exact time
          </button>
        )}

        {clashes.length > 0 && (
          <p className="text-xs text-status-warning" role="alert" data-testid="time-clash">
            {clashes.length === 1
              ? `"${clashes[0].name}" is already at ${formatTime(tm)}.`
              : `${clashes.length} other activities are already at ${formatTime(tm)}.`}
            {suggestion && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline text-accent"
                  onClick={() => { setTm(suggestion); onUpd({ time: suggestion }); }}
                  data-testid="use-free-time"
                >
                  Use {formatTime(suggestion)} instead
                </button>
              </>
            )}
          </p>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={2}
          className="w-full bg-surface-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none resize-none"
          aria-label="Notes" placeholder="Notes" />
        {/* Was a text link reading "Done", which named the moment rather
            than the action and looked like nothing else that commits. */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => { save(); closeDetail(); }} data-testid="activity-save-btn">Save</Button>
          <Button size="sm" variant="secondary" onClick={closeDetail} data-testid="activity-cancel-btn">Cancel</Button>
        </div>
      </div>
  );

  return (
    <div
      className="group card-surface flex items-stretch rounded-card overflow-hidden"
      data-testid="activity-card"
    >
      {/* Details take the full width of the card body. Actions live on the
          edge rail, so the name no longer competes with three buttons for
          room — "Visit to Royal Museum" was truncating to "Visit to Royal Mu".

          Tapping it opens everything the card had to leave out. A div rather
          than a button because the map flag inside it is a control of its own,
          and a button inside a button is not a thing. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetail('view')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetail('view');
          }
        }}
        aria-label={`${act.name} — open details`}
        className="flex-1 min-w-0 p-3 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none rounded-card"
        data-testid="activity-card-body"
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="shrink-0 text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full"
            data-testid="activity-time"
          >
            {slotLabel(act.time)}
          </span>
          {/* Kept beside the slot rather than replaced by it: a 3pm check-in
              belongs to Noon, but 3pm is still the thing you must not miss. */}
          {exactTime(act.time) && (
            <span className="shrink-0 text-[11px] text-ink-muted tabular-nums" data-testid="activity-exact-time">
              {formatTime(act.time)}
            </span>
          )}
          {act.budgetWarning && (
            <AlertTriangle size={12} className="text-status-warning shrink-0" aria-label="Budget warning" />
          )}
          {act.pinnedToTodo && (
            <span className="text-[10px] text-accent" data-testid="pinned-flag">Pinned</span>
          )}
        </div>

        {/* Wraps rather than truncating: the name is the one thing the user
            is scanning for. */}
        <p className="text-sm font-medium text-ink-primary leading-snug break-words">
          {act.name}
        </p>

        {act.locationName && (
          <p className="text-xs text-ink-muted mt-0.5 break-words">{act.locationName}</p>
        )}

        {/* Why this card is not on the map, and the way to fix it in the same
            control. A badge that only reported the problem would leave the
            user to go and find the field it is about. */}
        {mapGap && (
          <button
            type="button"
            // Straight into the field the flag is about, so the fix is one tap
            // rather than "open edit, then find the right box". Stopped from
            // bubbling, or the card underneath opens the reading view instead.
            onClick={e => { e.stopPropagation(); fixLocation(); }}
            className={`mt-1 inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
              mapGap.tone === 'warning'
                ? 'text-status-warning border-status-warning/40 hover:bg-status-warning/10'
                : 'text-ink-muted border-white/15 hover:text-ink-secondary hover:bg-white/5'
            }`}
            data-testid="map-gap-flag"
            data-gap={mapGap.kind}
          >
            <MapPinOff size={11} aria-hidden="true" />
            {mapGap.label}
          </button>
        )}

        {act.notes && (
          <p className="text-xs text-ink-secondary mt-1 line-clamp-3 break-words">{act.notes}</p>
        )}
      </div>

      {/* The same rail the to-do and clipboard cards use. */}
      <CardActionRail testId="activity-actions">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label={`Open ${act.name} in Google Maps`}
            title="Open in Google Maps"
            data-testid="activity-maps"
          >
            <MapPin size={16} />
          </a>
        )}
        <CardAction
          icon={<Pin size={16} />}
          label={act.pinnedToTodo ? 'Unpin from to-do' : 'Pin to to-do'}
          onClick={onPin}
          active={act.pinnedToTodo}
        />
        <CardAction icon={<Pencil size={16} />} label="Edit activity" onClick={() => setDetail('edit')} />
        <CardAction icon={<Trash2 size={16} />} label="Delete activity" onClick={onDel} tone="danger" />
      </CardActionRail>

      {detail && (
        <DetailModal
          title={detail === 'edit' ? 'Edit activity' : act.name}
          onClose={closeDetail}
          onEdit={() => setDetail('edit')}
          onDelete={() => { closeDetail(); onDel(); }}
          deleteLabel={`Delete ${act.name}`}
          mapUrl={mapsUrl}
          testId="activity-detail"
        >
          {detail === 'edit' ? editForm : (
            <dl className="-mt-1">
              <DetailRow label="When">
                {slotLabel(act.time)}
                {exactTime(act.time) && (
                  <span className="text-ink-secondary tabular-nums"> · {formatTime(act.time)}</span>
                )}
              </DetailRow>

              <DetailRow label="Where">
                {act.locationName?.trim() ? (
                  <>
                    {act.locationName}
                    {/* What the coordinates actually point at. On the card this
                        has nowhere to go; here it is the difference between a
                        location and the right one. */}
                    {act.address && act.address !== act.locationName && (
                      <span className="block text-xs text-ink-muted mt-0.5">{act.address}</span>
                    )}
                  </>
                ) : (
                  <span className="text-ink-muted">Not set</span>
                )}
                {mapGap && (
                  <button
                    type="button"
                    onClick={fixLocation}
                    className={`mt-1.5 flex items-center gap-1 text-xs ${
                      mapGap.tone === 'warning' ? 'text-status-warning' : 'text-ink-muted'
                    } hover:underline`}
                    data-testid="detail-map-gap"
                  >
                    <MapPinOff size={12} aria-hidden="true" />
                    {mapGap.label}
                  </button>
                )}
              </DetailRow>

              {/* The reason this modal exists: on the card these clamp to three
                  lines, so anything written past them was kept and then put
                  out of reach. */}
              {act.notes?.trim() && (
                <DetailRow label="Notes" testId="detail-notes">{act.notes}</DetailRow>
              )}

              {(act.pinnedToTodo || act.budgetWarning) && (
                <DetailRow label="Flags">
                  <span className="flex flex-wrap items-center gap-2">
                    {act.pinnedToTodo && (
                      <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                        Pinned to to-do
                      </span>
                    )}
                    {act.budgetWarning && (
                      <span className="flex items-center gap-1 text-xs text-status-warning">
                        <AlertTriangle size={12} aria-hidden="true" /> May exceed your budget
                      </span>
                    )}
                  </span>
                </DetailRow>
              )}
            </dl>
          )}
        </DetailModal>
      )}
    </div>
  );
}
