export const TEMP_UNIT_STORAGE = 'aitp_temp_unit';

export type TempUnit = 'C' | 'F';

/**
 * Which temperature scale to show.
 *
 * Celsius by default because the forecast arrives in it, so the default costs
 * no conversion and no rounding. Stored rather than guessed from the locale:
 * a traveller's preference follows them, and the country they are visiting is
 * a bad proxy for what they read comfortably.
 */
export function getTempUnit(): TempUnit {
  try {
    return localStorage.getItem(TEMP_UNIT_STORAGE) === 'F' ? 'F' : 'C';
  } catch {
    return 'C';
  }
}

export function setTempUnit(unit: TempUnit): void {
  try {
    localStorage.setItem(TEMP_UNIT_STORAGE, unit);
  } catch {
    /* the forecast is still readable in Celsius */
  }
}
