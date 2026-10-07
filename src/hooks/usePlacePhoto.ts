import { useEffect, useState } from 'react';
import { cachedPlacePhoto, fetchPlacePhoto, type PlacePhoto } from '../services/placePhoto';

/**
 * A photo for a place, or null while there is none.
 *
 * A cached photo is there on the first render, so a trip opened a second time
 * does not flash its fallback before the picture arrives.
 */
export function usePlacePhoto(place: string | null | undefined): PlacePhoto | null {
  const [photo, setPhoto] = useState<PlacePhoto | null>(() => (place ? cachedPlacePhoto(place) ?? null : null));

  useEffect(() => {
    if (!place?.trim()) {
      setPhoto(null);
      return;
    }
    const cached = cachedPlacePhoto(place);
    if (cached !== undefined) {
      setPhoto(cached);
      return;
    }
    setPhoto(null);
    if (!navigator.onLine) return;

    let live = true;
    fetchPlacePhoto(place).then((found) => {
      if (live) setPhoto(found);
    });
    return () => {
      live = false;
    };
  }, [place]);

  return photo;
}
