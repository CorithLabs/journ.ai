/*
 * The facts a traveller needs on arrival and tends to look up too late: which
 * plug, what voltage, who to call, what money, whether to drink the tap water,
 * which side of the road. Fixed per country, so kept here rather than asked of
 * an AI — it needs no key, works offline and cannot be made up.
 *
 * A general guide for the most visited countries, not a complete atlas: the
 * card says to check before travelling, and a country not listed simply shows
 * nothing. Checklist adapted from the travel-planner skill's "local intel"
 * (github.com/mistlemma/travel-planner, MIT).
 */

export type TapWater = 'safe' | 'varies' | 'bottled';

export interface CountryFacts {
  code: string;
  name: string;
  /** IEC plug types, e.g. ['A', 'B']. */
  plugs: string[];
  voltage: string;
  /** What to dial, most useful first: "112", or "110 police · 119 ambulance & fire". */
  emergency: string;
  currency: { code: string; name: string };
  tapWater: TapWater;
  drives: 'left' | 'right';
  /** Other names the country is written as. */
  aka?: string[];
}

const C = (
  code: string, name: string, plugs: string, voltage: string, emergency: string,
  currency: [string, string], tapWater: TapWater, drives: 'left' | 'right', aka?: string[],
): CountryFacts => ({ code, name, plugs: plugs.split(''), voltage, emergency, currency: { code: currency[0], name: currency[1] }, tapWater, drives, aka });

const EUR: [string, string] = ['EUR', 'Euro'];

export const COUNTRY_FACTS: CountryFacts[] = [
  // North America and the Caribbean
  C('US', 'United States', 'AB', '120 V', '911', ['USD', 'US dollar'], 'safe', 'right', ['USA', 'United States of America', 'America']),
  C('CA', 'Canada', 'AB', '120 V', '911', ['CAD', 'Canadian dollar'], 'safe', 'right'),
  C('MX', 'Mexico', 'AB', '127 V', '911', ['MXN', 'Mexican peso'], 'bottled', 'right'),
  C('CR', 'Costa Rica', 'AB', '120 V', '911', ['CRC', 'Costa Rican colón'], 'varies', 'right'),
  C('CU', 'Cuba', 'ABCL', '110 V / 220 V', '106 police · 104 ambulance · 105 fire', ['CUP', 'Cuban peso'], 'bottled', 'right'),
  // Europe
  C('GB', 'United Kingdom', 'G', '230 V', '999 or 112', ['GBP', 'Pound sterling'], 'safe', 'left', ['UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland']),
  C('IE', 'Ireland', 'G', '230 V', '112 or 999', EUR, 'safe', 'left'),
  C('FR', 'France', 'CE', '230 V', '112', EUR, 'safe', 'right'),
  C('DE', 'Germany', 'CF', '230 V', '112 (110 police)', EUR, 'safe', 'right'),
  C('IT', 'Italy', 'CFL', '230 V', '112', EUR, 'safe', 'right'),
  C('ES', 'Spain', 'CF', '230 V', '112', EUR, 'safe', 'right'),
  C('PT', 'Portugal', 'CF', '230 V', '112', EUR, 'safe', 'right'),
  C('NL', 'Netherlands', 'CF', '230 V', '112', EUR, 'safe', 'right', ['Holland', 'The Netherlands']),
  C('BE', 'Belgium', 'CE', '230 V', '112', EUR, 'safe', 'right'),
  C('CH', 'Switzerland', 'CJ', '230 V', '112 (117 police · 144 ambulance · 118 fire)', ['CHF', 'Swiss franc'], 'safe', 'right'),
  C('AT', 'Austria', 'CF', '230 V', '112', EUR, 'safe', 'right'),
  C('DK', 'Denmark', 'CEFK', '230 V', '112', ['DKK', 'Danish krone'], 'safe', 'right'),
  C('SE', 'Sweden', 'CF', '230 V', '112', ['SEK', 'Swedish krona'], 'safe', 'right'),
  C('NO', 'Norway', 'CF', '230 V', '112 police · 113 ambulance · 110 fire', ['NOK', 'Norwegian krone'], 'safe', 'right'),
  C('FI', 'Finland', 'CF', '230 V', '112', EUR, 'safe', 'right'),
  C('IS', 'Iceland', 'CF', '230 V', '112', ['ISK', 'Icelandic króna'], 'safe', 'right'),
  C('PL', 'Poland', 'CE', '230 V', '112', ['PLN', 'Polish złoty'], 'safe', 'right'),
  C('CZ', 'Czechia', 'CE', '230 V', '112', ['CZK', 'Czech koruna'], 'safe', 'right', ['Czech Republic']),
  C('HU', 'Hungary', 'CF', '230 V', '112', ['HUF', 'Hungarian forint'], 'safe', 'right'),
  C('GR', 'Greece', 'CF', '230 V', '112', EUR, 'varies', 'right'),
  C('HR', 'Croatia', 'CF', '230 V', '112', EUR, 'safe', 'right'),
  C('TR', 'Türkiye', 'CF', '230 V', '112', ['TRY', 'Turkish lira'], 'bottled', 'right', ['Turkey']),
  // Asia
  C('JP', 'Japan', 'AB', '100 V', '110 police · 119 ambulance & fire', ['JPY', 'Japanese yen'], 'safe', 'left'),
  C('KR', 'South Korea', 'CF', '220 V', '112 police · 119 ambulance & fire', ['KRW', 'South Korean won'], 'safe', 'right', ['Korea', 'Republic of Korea']),
  C('CN', 'China', 'ACI', '220 V', '110 police · 120 ambulance · 119 fire', ['CNY', 'Chinese yuan'], 'bottled', 'right'),
  C('HK', 'Hong Kong', 'G', '220 V', '999', ['HKD', 'Hong Kong dollar'], 'safe', 'left'),
  C('TW', 'Taiwan', 'AB', '110 V', '110 police · 119 ambulance & fire', ['TWD', 'New Taiwan dollar'], 'bottled', 'right'),
  C('SG', 'Singapore', 'G', '230 V', '999 police · 995 ambulance & fire', ['SGD', 'Singapore dollar'], 'safe', 'left'),
  C('MY', 'Malaysia', 'G', '240 V', '999', ['MYR', 'Malaysian ringgit'], 'bottled', 'left'),
  C('TH', 'Thailand', 'ABCO', '230 V', '191 police · 1669 ambulance · 199 fire · 1155 tourist police', ['THB', 'Thai baht'], 'bottled', 'left'),
  C('VN', 'Vietnam', 'ACF', '220 V', '113 police · 115 ambulance · 114 fire', ['VND', 'Vietnamese đồng'], 'bottled', 'right', ['Viet Nam']),
  C('ID', 'Indonesia', 'CF', '230 V', '112 (110 police · 118 ambulance · 113 fire)', ['IDR', 'Indonesian rupiah'], 'bottled', 'left'),
  C('PH', 'Philippines', 'ABC', '220 V', '911', ['PHP', 'Philippine peso'], 'bottled', 'right'),
  C('IN', 'India', 'CDM', '230 V', '112', ['INR', 'Indian rupee'], 'bottled', 'left'),
  C('LK', 'Sri Lanka', 'DGM', '230 V', '119 police · 1990 ambulance · 110 fire', ['LKR', 'Sri Lankan rupee'], 'bottled', 'left'),
  C('NP', 'Nepal', 'CDM', '230 V', '100 police · 102 ambulance · 101 fire', ['NPR', 'Nepalese rupee'], 'bottled', 'left'),
  // Middle East and Africa
  C('AE', 'United Arab Emirates', 'CDG', '230 V', '999 police · 998 ambulance · 997 fire', ['AED', 'UAE dirham'], 'varies', 'right', ['UAE', 'Dubai', 'Abu Dhabi']),
  C('IL', 'Israel', 'CHM', '230 V', '100 police · 101 ambulance · 102 fire', ['ILS', 'Israeli new shekel'], 'safe', 'right'),
  C('JO', 'Jordan', 'BCDFGJ', '230 V', '911', ['JOD', 'Jordanian dinar'], 'bottled', 'right'),
  C('EG', 'Egypt', 'CF', '220 V', '122 police · 123 ambulance · 180 fire', ['EGP', 'Egyptian pound'], 'bottled', 'right'),
  C('MA', 'Morocco', 'CE', '220 V', '19 police · 15 ambulance & fire', ['MAD', 'Moroccan dirham'], 'bottled', 'right'),
  C('ZA', 'South Africa', 'CDMN', '230 V', '10111 police · 10177 ambulance · 112 from a mobile', ['ZAR', 'South African rand'], 'varies', 'left'),
  C('KE', 'Kenya', 'G', '240 V', '999 or 112', ['KES', 'Kenyan shilling'], 'bottled', 'left'),
  C('TZ', 'Tanzania', 'DG', '230 V', '112', ['TZS', 'Tanzanian shilling'], 'bottled', 'left'),
  // Oceania
  C('AU', 'Australia', 'I', '230 V', '000', ['AUD', 'Australian dollar'], 'safe', 'left'),
  C('NZ', 'New Zealand', 'I', '230 V', '111', ['NZD', 'New Zealand dollar'], 'safe', 'left'),
  // South America
  C('AR', 'Argentina', 'CI', '220 V', '911', ['ARS', 'Argentine peso'], 'safe', 'right'),
  C('BR', 'Brazil', 'CN', '127 V / 220 V (varies by city)', '190 police · 192 ambulance · 193 fire', ['BRL', 'Brazilian real'], 'bottled', 'right'),
  C('CL', 'Chile', 'CL', '220 V', '133 police · 131 ambulance · 132 fire', ['CLP', 'Chilean peso'], 'varies', 'right'),
  C('PE', 'Peru', 'ABC', '220 V', '105 police · 106 ambulance · 116 fire', ['PEN', 'Peruvian sol'], 'bottled', 'right'),
  C('CO', 'Colombia', 'AB', '110 V', '123', ['COP', 'Colombian peso'], 'varies', 'right'),
];

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const BY_NAME = new Map<string, CountryFacts>();
for (const c of COUNTRY_FACTS) {
  for (const n of [c.name, c.code, ...(c.aka ?? [])]) BY_NAME.set(norm(n), c);
}

/** Facts for a country by ISO code or name ("JP", "Japan", "UK"), or null. */
export function countryFacts(codeOrName: string | null | undefined): CountryFacts | null {
  if (!codeOrName?.trim()) return null;
  return BY_NAME.get(norm(codeOrName)) ?? null;
}

/** "Type A / B" */
export function plugLabel(plugs: string[]): string {
  return `Type ${plugs.join(' / ')}`;
}

/**
 * Whether a charger from home plugs in there: its home country's main plug
 * (the first listed) is one the sockets there take. Canada to Japan, yes;
 * the UK to France, no.
 */
export function plugsFit(home: CountryFacts, away: CountryFacts): boolean {
  return away.plugs.includes(home.plugs[0]);
}

export function tapWaterLabel(t: TapWater): string {
  return t === 'safe' ? 'Safe to drink' : t === 'varies' ? 'Usually safe in cities; bottled is safer elsewhere' : 'Drink bottled or filtered water';
}
