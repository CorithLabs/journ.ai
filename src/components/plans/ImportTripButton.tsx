import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { importTrip, TripFileError } from '../../services/tripTransfer';

/** FileReader rather than file.text(), which older Safari lacks. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

interface Props {
  className?: string;
  label?: string;
  /** Called after a trip is added, e.g. to close the phone drawer. */
  onImported?: () => void;
}

/**
 * Open a trip file exported from journ.ai. It is added as a new trip, so
 * nothing already here is overwritten.
 */
export default function ImportTripButton({ className, label = 'Import a trip', onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const id = await importTrip(await readText(file));
      onImported?.();
      navigate(`/plan/${id}/itinerary`);
    } catch (e) {
      setError(e instanceof TripFileError ? e.message : 'The trip could not be imported.');
    } finally {
      setBusy(false);
      // Choosing the same file again should try again.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={className ?? 'flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary disabled:opacity-50'}
        data-testid="import-trip-btn"
      >
        <Upload size={14} aria-hidden="true" /> {busy ? 'Importing…' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        data-testid="import-trip-input"
        aria-label="Trip file to import"
      />
      {error && <p role="alert" className="mt-1.5 text-xs text-status-danger" data-testid="import-trip-error">{error}</p>}
    </div>
  );
}
