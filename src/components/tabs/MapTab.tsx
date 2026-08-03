import { Map } from 'lucide-react';

interface Props {
  planId: string;
}

export default function MapTab({ planId: _planId }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <Map size={48} className="text-accent-muted mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink-primary mb-2">Map View</h2>
      <p className="text-sm text-ink-secondary">
        Route visualisation and map pins will appear here once your itinerary is
        generated.
      </p>
    </div>
  );
}
