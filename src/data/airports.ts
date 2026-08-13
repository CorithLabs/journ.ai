/**
 * The airport you actually fly into for a given city.
 *
 * Curated rather than looked up, because the hard part is a judgement no API
 * answers well: London has six airports and Heathrow is the one a long-haul
 * traveller means; Tokyo has two and Narita is the international gateway;
 * Milan's Linate and Rome's Ciampino are short-haul, and Buenos Aires' Aeroparque
 * is domestic. "Which of these two" is editorial, and a table is honest about
 * that where a ranked search result would not be.
 *
 * Several cities have no airport at all — you fly into Kansai for Kyoto and
 * into Calgary for Banff — so `city` is where the airport actually is. That
 * keeps the trip's arrival city a real city, which the geocoding anchors and
 * the per-day city both depend on.
 *
 * Coverage matches the app's own destination suggestions. Anything not here
 * simply gets no airport filled in, which is the right failure: a blank field
 * invites the traveller to name theirs, while a wrong guess has to be noticed
 * before it can be corrected.
 */

export interface CityAirport {
  /** IATA code, e.g. "NRT". */
  iata: string;
  /** The airport's common name, without the word "airport". */
  name: string;
  /** The city the airport is in — not always the city you are visiting. */
  city: string;
  /** Set when the airport is not in the destination itself. */
  elsewhere?: boolean;
}

type Entry = [city: string, iata: string, name: string, inCity?: string];

const AIRPORTS: Entry[] = [
  // Japan. Narita over Haneda: Haneda carries a growing share, but Narita is
  // still the international gateway most long-haul arrivals mean. Kyoto has no
  // airport of its own.
  ['Tokyo', 'NRT', 'Narita International'],
  ['Kyoto', 'KIX', 'Kansai International', 'Osaka'],
  ['Osaka', 'KIX', 'Kansai International'],

  // France. Charles de Gaulle over Orly, which is mostly domestic and
  // short-haul European.
  ['Paris', 'CDG', 'Charles de Gaulle'],
  ['Nice', 'NCE', "Côte d'Azur"],

  // United Kingdom. Heathrow over Gatwick, Stansted, Luton and City.
  ['London', 'LHR', 'Heathrow'],
  ['Edinburgh', 'EDI', 'Edinburgh'],

  // Italy. Fiumicino over Ciampino, Malpensa over Linate — in both cases the
  // second is the short-haul and low-cost one.
  ['Rome', 'FCO', 'Fiumicino'],
  ['Milan', 'MXP', 'Malpensa'],
  ['Venice', 'VCE', 'Marco Polo'],
  ['Florence', 'FLR', 'Amerigo Vespucci'],

  ['Barcelona', 'BCN', 'Josep Tarradellas El Prat'],
  ['Madrid', 'MAD', 'Adolfo Suárez Barajas'],
  ['Seville', 'SVQ', 'Seville'],
  ['Lisbon', 'LIS', 'Humberto Delgado'],
  ['Porto', 'OPO', 'Francisco Sá Carneiro'],
  ['Amsterdam', 'AMS', 'Schiphol'],
  ['Berlin', 'BER', 'Brandenburg'],
  ['Munich', 'MUC', 'Munich'],
  ['Vienna', 'VIE', 'Vienna'],
  ['Prague', 'PRG', 'Václav Havel'],
  ['Budapest', 'BUD', 'Ferenc Liszt'],
  ['Zurich', 'ZRH', 'Zurich'],
  ['Copenhagen', 'CPH', 'Kastrup'],
  ['Stockholm', 'ARN', 'Arlanda'],
  ['Oslo', 'OSL', 'Gardermoen'],
  ['Reykjavik', 'KEF', 'Keflavík'],
  ['Dublin', 'DUB', 'Dublin'],
  ['Athens', 'ATH', 'Eleftherios Venizelos'],
  // Istanbul Airport over Sabiha Gökçen, which sits on the Asian side and
  // carries mostly low-cost traffic.
  ['Istanbul', 'IST', 'Istanbul'],
  ['Dubai', 'DXB', 'Dubai International'],
  ['Doha', 'DOH', 'Hamad International'],

  // United States. JFK over Newark and LaGuardia; O'Hare over Midway.
  ['New York', 'JFK', 'John F. Kennedy International'],
  ['San Francisco', 'SFO', 'San Francisco International'],
  ['Los Angeles', 'LAX', 'Los Angeles International'],
  ['Chicago', 'ORD', "O'Hare International"],
  ['Seattle', 'SEA', 'Seattle–Tacoma International'],
  ['Boston', 'BOS', 'Logan International'],
  ['Miami', 'MIA', 'Miami International'],
  ['Las Vegas', 'LAS', 'Harry Reid International'],
  ['Honolulu', 'HNL', 'Daniel K. Inouye International'],
  ['New Orleans', 'MSY', 'Louis Armstrong International'],

  // Canada. Banff has no airport; Calgary is the one you land at.
  ['Toronto', 'YYZ', 'Pearson International'],
  ['Vancouver', 'YVR', 'Vancouver International'],
  ['Montreal', 'YUL', 'Pierre Elliott Trudeau International'],
  ['Quebec City', 'YQB', 'Jean Lesage International'],
  ['Banff', 'YYC', 'Calgary International', 'Calgary'],

  ['Mexico City', 'MEX', 'Benito Juárez International'],
  ['Cancun', 'CUN', 'Cancún International'],
  // Galeão over Santos Dumont, which is domestic.
  ['Rio de Janeiro', 'GIG', 'Galeão International'],
  // Ezeiza over Aeroparque, which is domestic and regional.
  ['Buenos Aires', 'EZE', 'Ministro Pistarini International'],
  ['Lima', 'LIM', 'Jorge Chávez International'],
  ['Cusco', 'CUZ', 'Alejandro Velasco Astete International'],
  ['Santiago', 'SCL', 'Arturo Merino Benítez International'],
  ['Bogota', 'BOG', 'El Dorado International'],
  ['Cartagena', 'CTG', 'Rafael Núñez International'],

  // Suvarnabhumi over Don Mueang, which is the low-cost airport.
  ['Bangkok', 'BKK', 'Suvarnabhumi'],
  ['Chiang Mai', 'CNX', 'Chiang Mai International'],
  ['Phuket', 'HKT', 'Phuket International'],
  ['Singapore', 'SIN', 'Changi'],
  ['Hong Kong', 'HKG', 'Hong Kong International'],
  // Incheon over Gimpo, which is domestic and short regional.
  ['Seoul', 'ICN', 'Incheon International'],
  ['Beijing', 'PEK', 'Capital International'],
  // Pudong over Hongqiao, which is domestic.
  ['Shanghai', 'PVG', 'Pudong International'],
  ['Taipei', 'TPE', 'Taoyuan International'],
  ['Hanoi', 'HAN', 'Noi Bai International'],
  ['Ho Chi Minh City', 'SGN', 'Tan Son Nhat International'],
  ['Bali', 'DPS', 'Ngurah Rai International', 'Denpasar'],
  ['Kuala Lumpur', 'KUL', 'Kuala Lumpur International'],
  ['Delhi', 'DEL', 'Indira Gandhi International'],
  ['Mumbai', 'BOM', 'Chhatrapati Shivaji Maharaj International'],
  ['Jaipur', 'JAI', 'Jaipur International'],
  ['Kathmandu', 'KTM', 'Tribhuvan International'],
  ['Colombo', 'CMB', 'Bandaranaike International'],

  ['Sydney', 'SYD', 'Kingsford Smith'],
  ['Melbourne', 'MEL', 'Tullamarine'],
  ['Brisbane', 'BNE', 'Brisbane International'],
  ['Auckland', 'AKL', 'Auckland International'],
  ['Queenstown', 'ZQN', 'Queenstown'],

  ['Cape Town', 'CPT', 'Cape Town International'],
  ['Johannesburg', 'JNB', 'O. R. Tambo International'],
  ['Marrakesh', 'RAK', 'Menara'],
  ['Cairo', 'CAI', 'Cairo International'],
  ['Nairobi', 'NBO', 'Jomo Kenyatta International'],
];

const BY_CITY = new Map<string, CityAirport>(
  AIRPORTS.map(([city, iata, name, inCity]) => [
    city.toLowerCase(),
    { iata, name, city: inCity ?? city, elsewhere: Boolean(inCity) },
  ]),
);

/**
 * The airport for a destination, or null when we do not know one.
 *
 * Tolerates the qualifiers a destination arrives with — "Tokyo, Japan" and
 * "Tokyo" are the same trip — because the field this reads from is filled
 * either by a picked suggestion or by hand.
 */
export function airportForCity(destination: string | undefined | null): CityAirport | null {
  const bare = destination?.split(',')[0]?.trim().toLowerCase();
  if (!bare) return null;
  return BY_CITY.get(bare) ?? null;
}

/** "Narita International (NRT)" — what goes on the leg. */
export function airportLabel(airport: CityAirport): string {
  return `${airport.name} (${airport.iata})`;
}
