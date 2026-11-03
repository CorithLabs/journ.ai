import type { TravelMode } from '../db';
import { haversineKm } from '../services/places';

/*
 * Continents by ISO 3166 country code. Enough to tell a trip that could be
 * driven or taken by train from one with an ocean in the way; not a political
 * statement about where any border runs.
 */
const CONTINENTS: Record<string, string> = {};
const add = (continent: string, codes: string) => codes.split(' ').forEach((c) => { CONTINENTS[c] = continent; });
add('EU', 'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK TR');
add('AS', 'AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TW UZ VN YE');
add('NA', 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI');
add('SA', 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE');
add('AF', 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW');
add('OC', 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS');

/*
 * Islands and island nations, where a car or a train cannot simply cross to
 * the mainland. Britain and Ireland are left out: the tunnel and the ferries
 * make driving and the train real options there.
 */
const ISLANDS = new Set('IS MT CY JP TW PH ID LK MV SG NZ AU FJ MG MU SC CV JM CU DO HT BS BB TT PR'.split(' '));

export function continentOf(countryCode?: string | null): string | null {
  return countryCode ? CONTINENTS[countryCode.toUpperCase()] ?? null : null;
}

export interface Place {
  coordinates?: [number, number];
  countryCode?: string | null;
}

/**
 * The ways it makes sense to travel between two places, best first.
 *
 * From distance and geography alone: there is no free service that knows
 * whether a train actually runs between two towns, so "Train" here means the
 * distance suits one. The traveller chooses; the rest stay a tap away.
 *
 *   under 300 km, same landmass  → Car · Train · Bus
 *   300–800 km                   → Train · Car · Flight
 *   800–1,500 km                 → Flight · Train · Car
 *   further, or across a sea     → Flight
 */
export function suggestModes(from: Place, to: Place): TravelMode[] {
  if (!from.coordinates || !to.coordinates) return [];
  const km = haversineKm(from.coordinates, to.coordinates);
  const a = continentOf(from.countryCode);
  const b = continentOf(to.countryCode);
  const sameCountry = !!from.countryCode && from.countryCode === to.countryCode;
  // A sea in the way: another continent, or onto or off an island country.
  const overWater =
    (a && b && a !== b) ||
    (!sameCountry && (ISLANDS.has(from.countryCode?.toUpperCase() ?? '') || ISLANDS.has(to.countryCode?.toUpperCase() ?? '')));

  if (overWater) return km < 300 ? ['ferry', 'flight'] : ['flight'];
  if (km < 300) return ['car', 'train', 'bus'];
  if (km < 800) return ['train', 'car', 'flight'];
  if (km < 1500) return ['flight', 'train', 'car'];
  return ['flight'];
}

/** Whether a mode means a ticket to buy (and so a "booked?" question). */
export function needsTicket(mode: TravelMode | undefined): boolean {
  return mode === 'flight' || mode === 'train' || mode === 'bus' || mode === 'ferry';
}
