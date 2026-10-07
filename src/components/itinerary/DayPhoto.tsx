import { MapPin } from 'lucide-react';
import { usePlacePhoto } from '../../hooks/usePlacePhoto';

/**
 * A picture at the top of a day spent somewhere new — the next city, or a day
 * out. Nothing at all when none is found: unlike the trip's own photo, a day
 * does not need a stand-in.
 */
export default function DayPhoto({ place }: { place: string }) {
  const photo = usePlacePhoto(place);
  if (!photo) return null;
  const name = place.split(',')[0].trim();
  return (
    <figure className="relative m-0 h-36 md:h-44 overflow-hidden" data-testid="day-photo">
      <img src={photo.src} alt={photo.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-base/85 via-transparent to-transparent" aria-hidden="true" />
      <figcaption className="absolute left-4 md:left-6 right-4 bottom-2.5 flex items-end justify-between gap-3 text-xs">
        <span className="flex items-center gap-1 font-semibold text-ink-primary">
          <MapPin size={12} aria-hidden="true" /> {name}
        </span>
        <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-ink-primary/60 hover:text-ink-primary">
          Photo · Wikipedia
        </a>
      </figcaption>
    </figure>
  );
}
