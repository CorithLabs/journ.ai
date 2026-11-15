import { v4 as uuidv4 } from 'uuid';
import { db, type Plan, type TodoItem, type ClipboardItem } from './index';
import { useAppStore } from '../store';
import { travelBasics } from '../utils/tripStartTodos';

/**
 * First-launch demo seed.
 *
 * On the very first boot (no plans in IndexedDB, no `aitp_seeded` flag) a
 * realistic 3-day Tokyo plan is written so a new user can explore every tab
 * without generating anything. The seed runs at most once — even if the user
 * later deletes all plans the `aitp_seeded` localStorage flag prevents a
 * re-seed. Entirely static data; no AI calls.
 */

export const SEEDED_FLAG = 'aitp_seeded';
export const DEMO_BANNER_DISMISSED = 'aitp_demo_banner_dismissed';
/** Records which plan is the demo, so the demo banner can target it. */
export const DEMO_PLAN_ID = 'aitp_demo_plan_id';

/**
 * How far ahead the sample trip starts: a week, so the whole trip sits inside
 * the live forecast (Open-Meteo goes about 16 days out) and shows real weather.
 */
export const SAMPLE_LEAD_DAYS = 7;
/**
 * The furthest out the sample trip may end and still be forecast, with margin
 * below the 16-day horizon. Past it, the trip is moved back in.
 */
export const SAMPLE_LATEST_END_DAYS = 13;
/** Days 1–3, so it ends two days after it starts. */
const SAMPLE_LENGTH_DAYS = 3;

/**
 * YYYY-MM-DD N days from today in the user's own time zone. Not
 * toISOString(), which is UTC and would put an evening in Sydney or a late
 * night in California on the wrong day.
 */
function localDateOffset(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The sample trip's dates as of now: a week out, for three days. */
export function sampleTripDates(now = new Date()): { startDate: string; endDate: string } {
  return {
    startDate: localDateOffset(SAMPLE_LEAD_DAYS, now),
    endDate: localDateOffset(SAMPLE_LEAD_DAYS + SAMPLE_LENGTH_DAYS - 1, now),
  };
}

function activity(name: string, time: string, locationName: string, notes: string) {
  return {
    id: uuidv4(),
    name,
    time,
    locationName,
    notes,
    pinnedToTodo: false,
    budgetWarning: false,
  };
}

/*
 * Day 3 is all under a roof on purpose: it is the day the rainy Day 2 can
 * trade with. Day 1 is the arrival, which cannot move, and the Nikko day trip
 * that used to be here was all waterfalls and shrines — swapping it onto a
 * wet day only moved the problem.
 */
const SAMPLE_DAY3_LABEL = 'Day 3 — Museums & Arcades';
function sampleDay3Activities() {
  return [
    activity('teamLab Planets', '10:00', 'Toyosu, Tokyo', 'Walk-through digital art, barefoot through the water rooms. All indoors.'),
    activity('Tokyo National Museum', '13:30', 'Ueno, Tokyo', "Japan's oldest museum: samurai armour, ukiyo-e and Buddhist art."),
    activity('Sunshine City', '16:30', 'Ikebukuro, Tokyo', 'Pokémon Center, an aquarium and anime shops under one roof.'),
    activity('Ebisu Yokocho', '19:30', 'Ebisu, Tokyo', 'A covered hall of tiny izakaya counters.'),
  ];
}

/** The sample's Day 3 as first shipped: the Nikko day trip. */
const OLD_DAY3 = ['Nikko Tosho-gu Shrine', 'Kegon Falls', 'Return to Tokyo'];

/**
 * Gives a sample trip seeded before Day 3 became the indoor day the new one,
 * so its rainy-day swap has somewhere to go. Only when Day 3 is exactly as it
 * was seeded: a Day 3 someone has changed is theirs.
 */
export async function upgradeSampleTrip(plan: Plan): Promise<boolean> {
  const day = plan.itinerary?.find((d) => d.dayIndex === 2);
  if (!day || day.activities.map((a) => a.name).join('|') !== OLD_DAY3.join('|')) return false;
  const itinerary = plan.itinerary.map((d) =>
    d.dayIndex === 2
      ? { ...d, label: SAMPLE_DAY3_LABEL, estimatedDailySpend: { min: 90, max: 150, currency: 'USD' }, activities: sampleDay3Activities() }
      : d,
  );
  await db.plans.update(plan.id, { itinerary, updatedAt: new Date().toISOString() });
  return true;
}

function buildDemoPlan(): Plan {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    name: 'Tokyo Explorer',
    destination: 'Tokyo, Japan',
    // A week out, inside the forecast horizon, so the itinerary shows the
    // live weather forecast for every day.
    ...sampleTripDates(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    intake: {
      numTravellers: 2,
      kids: false,
      kidAges: [],
      likes: ['street food', 'temples', 'anime'],
      dislikes: ['crowds'],
      budgetRange: 'mid',
      flightsBooked: true,
      accommodationBooked: true,
    },
    itinerary: [
      {
        dayIndex: 0,
        label: 'Day 1 — Tokyo Arrival',
        estimatedDailySpend: { min: 80, max: 140, currency: 'USD' },
        activities: [
          activity('Tsukiji Outer Market', '08:00', 'Tsukiji, Tokyo', 'Arrive early for a fresh sushi breakfast.'),
          activity('Senso-ji Temple', '10:30', 'Asakusa, Tokyo', "Tokyo's oldest temple — browse Nakamise shopping street."),
          activity('Akihabara Electric Town', '14:00', 'Akihabara, Tokyo', 'Anime, electronics and retro arcades.'),
          activity('Shibuya Crossing', '19:00', 'Shibuya, Tokyo', 'Iconic scramble crossing at night.'),
        ],
      },
      {
        dayIndex: 1,
        label: 'Day 2 — Culture & Parks',
        estimatedDailySpend: { min: 70, max: 120, currency: 'USD' },
        activities: [
          activity('Meiji Shrine', '09:00', 'Shibuya, Tokyo', 'Forested shrine dedicated to Emperor Meiji.'),
          activity('Harajuku Takeshita Street', '11:00', 'Harajuku, Tokyo', 'Youth fashion and crepes.'),
          activity('Shinjuku Gyoen', '13:30', 'Shinjuku, Tokyo', 'Relaxing garden stroll.'),
          activity('Omoide Yokocho', '19:30', 'Shinjuku, Tokyo', 'Atmospheric alley of tiny yakitori bars.'),
        ],
      },
      {
        dayIndex: 2,
        label: SAMPLE_DAY3_LABEL,
        estimatedDailySpend: { min: 90, max: 150, currency: 'USD' },
        activities: sampleDay3Activities(),
      },
    ],
  };
}

function buildDemoTodos(planId: string): TodoItem[] {
  const now = new Date().toISOString();
  const base = { planId, createdAt: now, updatedAt: now };
  return [
    {
      ...base,
      id: uuidv4(),
      title: 'Book flights to Tokyo',
      category: 'Booking',
      status: 'done',
      autoGenerated: true,
    },
    {
      ...base,
      id: uuidv4(),
      title: 'Book accommodation for each night',
      category: 'Booking',
      status: 'done',
      autoGenerated: true,
    },
    {
      ...base,
      id: uuidv4(),
      title: 'Get travel insurance',
      category: 'Document',
      status: 'todo',
      autoGenerated: false,
    },
    ...travelBasics(planId, true, { destination: 'JP' }).map((t) => ({ ...t, ...base, id: uuidv4() })),
  ];
}

function buildDemoClipboard(planId: string): ClipboardItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: uuidv4(),
      planId,
      type: 'Note',
      title: 'Hotel — Shinjuku Grand',
      body: 'Check-in: 3pm. Confirmation: TK-2025-88421. Free breakfast included. Address: 2-chome, Kabukicho, Shinjuku.',
      linkedDayIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * Seed the demo plan if this is a first launch. Idempotent and safe to call on
 * every boot. Any IndexedDB error is swallowed so app boot is never blocked.
 * Returns the seeded plan's id, or null if no seed was written.
 */
/**
 * The sample Tokyo trip, added now whatever came before — from Settings, for
 * anyone who deleted it or whose first launch did not add it. Dated from
 * today, so its weather is live.
 */
export async function addSampleTrip(): Promise<string> {
  const plan = buildDemoPlan();
  await db.plans.add(plan);
  await db.todos.bulkAdd(buildDemoTodos(plan.id));
  await db.clipboard.bulkAdd(buildDemoClipboard(plan.id));
  localStorage.setItem(SEEDED_FLAG, 'true');
  localStorage.setItem(DEMO_PLAN_ID, plan.id);
  return plan.id;
}

/**
 * The sample trip's id for the /demo link: the one already in this browser if
 * it is still there, otherwise a fresh copy. A shared link should always land
 * on the trip, whatever the visitor deleted before.
 */
export async function ensureSampleTrip(): Promise<string> {
  let existing: string | null = null;
  try {
    existing = localStorage.getItem(DEMO_PLAN_ID);
  } catch {
    /* storage unavailable — add a fresh copy */
  }
  if (existing) {
    const plan = await db.plans.get(existing);
    if (plan && !plan.deleted) {
      await keepSampleTripAhead(plan);
      await upgradeSampleTrip(plan);
      return existing;
    }
  }
  return addSampleTrip();
}

/**
 * Keeps the sample trip in the window where it shows off the weather: still
 * to come, and ending inside the forecast. Once it has started, or if it sits
 * past the forecast (moved there, or dated by an older build), it goes back
 * to a week out. Returns whether it moved.
 */
export async function keepSampleTripAhead(plan: Plan, now = new Date()): Promise<boolean> {
  const today = localDateOffset(0, now);
  const latestEnd = localDateOffset(SAMPLE_LATEST_END_DAYS, now);
  const end = plan.endDate || plan.startDate;
  if (plan.startDate && plan.startDate > today && end && end <= latestEnd) return false;
  await db.plans.update(plan.id, { ...sampleTripDates(now), updatedAt: now.toISOString() });
  return true;
}

/** On boot: keep the sample trip in this browser, if any, inside the forecast. */
async function refreshSampleTripDates(): Promise<void> {
  const id = localStorage.getItem(DEMO_PLAN_ID);
  if (!id) return;
  const plan = await db.plans.get(id);
  if (plan && !plan.deleted) {
    await keepSampleTripAhead(plan);
    await upgradeSampleTrip(plan);
  }
}

export async function seedDemoDataIfNeeded(): Promise<string | null> {
  try {
    // Flag guard: once seeded, never seed again — even if the user deletes
    // all their plans.
    if (localStorage.getItem(SEEDED_FLAG) === 'true') {
      await refreshSampleTripDates();
      return null;
    }

    // Never overwrite existing user data.
    const existingCount = await db.plans.filter((p) => !p.deleted).count();
    if (existingCount > 0) {
      // Data already present (e.g. migrated from before the flag existed) —
      // set the flag so we don't consider seeding again.
      localStorage.setItem(SEEDED_FLAG, 'true');
      return null;
    }

    const id = await addSampleTrip();
    // Highlight the demo plan in the sidebar immediately.
    useAppStore.getState().setActivePlan(id);
    return id;
  } catch (err) {
    // Log and continue — a seed failure must never block app boot.
    // eslint-disable-next-line no-console
    console.error('Demo seed failed:', err);
    return null;
  }
}
