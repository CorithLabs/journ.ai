import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LocateFixed } from 'lucide-react';
import type { Plan } from '../../db';
import { getDayColor } from '../../constants/colors';
import { totalRouteDistanceKm, haversineKm, type PinActivity } from '../../services/places';
import type { BBox, DiscoveredPlace } from '../../services/discover';
import { tripRoute } from '../../utils/travel';
import { dayPlace } from '../../utils/dayPlace';
import { dateRange } from '../../utils/dateText';
import { spreadCoincident } from './spread';
import { canDrawStreets, type BaseView } from './PaperBaseMap';
import {
  directionWord,
  districtOf,
  edgePoint,
  fitProjection,
  graticuleStep,
  inkOf,
  niceScaleKm,
  splitNearFar,
  type Box,
  type LngLat,
  type Projection,
} from './paperGeometry';

interface Props {
  plan: Plan;
  selectedDayIndex: number | null; // null = all days
  pins: PinActivity[];
  onDistanceChange: (km: number | null) => void;
  onPinClick: (pin: PinActivity) => void;
  /** The pin whose card is open, drawn with a ring so the link is obvious. */
  selectedActivityId?: string | null;
  /**
   * Places found by a discovery filter, drawn apart from the itinerary's own:
   * hollow and unnumbered, because one that looked like a numbered stop would
   * read as something already planned.
   */
  discovered?: DiscoveredPlace[];
  onDiscoveredClick?: (place: DiscoveredPlace) => void;
  /** The area the sheet shows, so a search can be about what is being looked at. */
  onViewportChange?: (bbox: BBox) => void;
}

/* The sheet is its own world: cream paper and brown ink, whatever the theme. */
const PAPER = '#f3ead5';
const PAPER_2 = '#ebe0c6';
const INK = '#5b4a2e';
const FAINT = '#a8977a';
const SERIF = 'Lora, Georgia, serif';
const SANS = 'ui-sans-serif, system-ui, sans-serif';
const FOUND = '#047857';

/** Used until the sheet has been measured, and where it cannot be (tests). */
const FALLBACK = { w: 720, h: 540 };

// The street map and its renderer arrive only when the map is opened.
const PaperBaseMap = lazy(() => import('./PaperBaseMap'));

const PIN_PATH = 'M0,0 C-3,-7 -11,-12 -11,-21 A11,11 0 1 1 11,-21 C11,-12 3,-7 0,0 Z';

interface Item {
  pin: PinActivity;
  at: LngLat;
}

function activate(e: KeyboardEvent, run: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    run();
  }
}

/**
 * The trip, drawn as a paper map.
 *
 * Numbered pins in each day's colour at their real positions, each day's
 * route dotted in the order it is walked, the neighbourhoods its stops are in,
 * a scale and a compass. It shows where things sit relative to each other,
 * which is what the map is for; directions are handed to the phone's own maps
 * app from each stop's card.
 *
 * The sheet frames the main group of stops. A day out more than 40km away gets
 * an inset of its own instead of shrinking the city to a dot, and a single far
 * stop becomes an arrow at the edge saying how far, and which way.
 */
export default function PaperMap({
  plan,
  selectedDayIndex,
  pins,
  onDistanceChange,
  onPinClick,
  selectedActivityId,
  discovered,
  onDiscoveredClick,
  onViewportChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);
  /*
   * The city under the pins: real streets when they can be drawn, the plain
   * sheet when they cannot — offline, no WebGL, or the tiles would not load.
   * Either way the sheet looks like the same piece of paper.
   */
  const [streets, setStreets] = useState(canDrawStreets);
  const [baseView, setBaseView] = useState<BaseView | null>(null);
  const [recentre, setRecentre] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 120 && height > 120) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const compact = W < 560;
  const m = compact ? 10 : 16; // frame margin

  const items: Item[] = useMemo(() => {
    const placed = spreadCoincident(pins);
    return pins.map((pin, i) => ({ pin, at: placed[i] }));
  }, [pins]);

  const layout = useMemo(() => {
    const { near, far, mid } = splitNearFar(items.map((i) => i.at));
    const nearItems = near.map((i) => items[i]);
    const farItems = far.map((i) => items[i]);

    // With every day on the sheet, a day spent away is a day trip: an inset.
    let insetItems: Item[] = [];
    if (selectedDayIndex === null) {
      const byDay = new Map<number, Item[]>();
      for (const it of farItems) byDay.set(it.pin.dayIndex, [...(byDay.get(it.pin.dayIndex) ?? []), it]);
      insetItems = [...byDay.values()].find((list) => list.length >= 2) ?? [];
    }
    const arrowItems = farItems.filter((it) => !insetItems.includes(it));

    const insetBox: Box | null = insetItems.length
      ? (() => {
          const iw = compact ? 150 : 230;
          const ih = compact ? 120 : 170;
          return { x: W - m - 12 - iw, y: m + 12, w: iw, h: ih };
        })()
      : null;

    const pad = compact ? { l: 46, r: 46, t: 86, b: 70 } : { l: 90, r: 90, t: 96, b: 84 };
    if (insetBox) pad.r = Math.max(pad.r, compact ? 60 : insetBox.w * 0.55);
    const framed = nearItems.length ? nearItems : items;
    const P = fitProjection(framed.length ? framed.map((i) => i.at) : [mid], { x: 0, y: 0, w: W, h: H }, pad);

    // The same stops, as bounds for the street map to frame.
    const pts = framed.length ? framed.map((i) => i.at) : [mid];
    const span = 0.006; // a single pin still gets its streets around it
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const frame: [LngLat, LngLat] = [
      [Math.min(...lngs) - span, Math.min(...lats) - span],
      [Math.max(...lngs) + span, Math.max(...lats) + span],
    ];
    const padding = { top: pad.t, bottom: pad.b, left: pad.l, right: pad.r };

    return { nearItems, insetItems, arrowItems, insetBox, P: P as Projection, mid, frame, padding };
  }, [items, selectedDayIndex, W, H, compact, m]);

  const { nearItems, insetItems, arrowItems, insetBox, mid, frame, padding } = layout;
  // Over the street map, things go where the map says; on plain paper, where the fit does.
  const onStreets = streets && !!baseView;
  const P: Projection = onStreets ? { xy: baseView!.xy, ll: baseView!.ll, pxPerKm: baseView!.pxPerKm } : layout.P;
  const frameKey = `${selectedDayIndex ?? 'all'}:${pins.map((p) => p.activity.id).join(',')}`;

  // The day's straight-line route, for the strip under the map.
  useEffect(() => {
    if (selectedDayIndex === null || pins.length < 2) {
      onDistanceChange(null);
      return;
    }
    onDistanceChange(totalRouteDistanceKm(pins.map((p) => p.activity.coordinates!)));
  }, [pins, selectedDayIndex, onDistanceChange]);

  // The area inside the frame, so Discover searches what is on the sheet.
  const viewportRef = useRef(onViewportChange);
  viewportRef.current = onViewportChange;
  const lastBox = useRef('');
  useEffect(() => {
    if (!items.length) return;
    let bbox: BBox;
    if (onStreets) {
      bbox = baseView!.bounds;
    } else {
      const [w, n] = P.ll(m, m);
      const [e, s] = P.ll(W - m, H - m);
      bbox = [w, s, e, n];
    }
    const key = bbox.map((v) => v.toFixed(4)).join(',');
    if (key === lastBox.current) return;
    lastBox.current = key;
    viewportRef.current?.(bbox);
  }, [P, items.length, W, H, m, onStreets, baseView]);

  const day = selectedDayIndex !== null ? plan.itinerary.find((d) => d.dayIndex === selectedDayIndex) : null;
  const destinationName = plan.destination.split(',')[0].trim();
  const title = day ? dayPlace(plan, day).split(',')[0].trim() : destinationName;
  const subtitle = day ? day.label : [plan.name, dateRange(plan.startDate, plan.endDate)].filter(Boolean).join(' · ');

  const cities = useMemo(() => [plan.destination, ...tripRoute(plan)], [plan]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full rounded-card overflow-hidden shadow-card"
      style={{ background: PAPER }}
      data-testid="paper-map"
      role="group"
      aria-label={`Map showing itinerary for ${plan.destination}`}
    >
      {streets && (
        <Suspense fallback={null}>
          <PaperBaseMap
            frame={frame}
            padding={padding}
            frameKey={frameKey}
            recentre={recentre}
            onView={setBaseView}
            onUnavailable={() => { setStreets(false); setBaseView(null); }}
          />
        </Suspense>
      )}
      {/* Over the street map the sheet only draws; dragging goes to the map,
          and only the pins and markers take a tap. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        className="absolute inset-0"
        style={{ display: 'block', pointerEvents: onStreets ? 'none' : undefined }}
      >
        <defs>
          <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .16  0 0 0 .07 0" />
          </filter>
          <radialGradient id="paper-vignette" cx="50%" cy="45%" r="75%">
            <stop offset="60%" stopColor={PAPER} stopOpacity={0} />
            <stop offset="100%" stopColor="#c9b48a" stopOpacity={0.45} />
          </radialGradient>
        </defs>

        {!onStreets && <rect width={W} height={H} fill={PAPER} />}
        {/* Grain only on plain paper: over the street map it renders as a
            solid sheet in Chrome, and the tiles are already paper-coloured. */}
        {!onStreets && <rect width={W} height={H} filter="url(#paper-grain)" />}
        <rect width={W} height={H} fill="url(#paper-vignette)" opacity={onStreets ? 0.7 : 1} />
        <rect x={m} y={m} width={W - 2 * m} height={H - 2 * m} fill="none" stroke={INK} strokeWidth={1.5} opacity={0.7} />
        <rect x={m + 4} y={m + 4} width={W - 2 * m - 8} height={H - 2 * m - 8} fill="none" stroke={INK} strokeWidth={0.6} opacity={0.5} />

        {/* The street map has its own streets and names; these are for plain paper. */}
        {!onStreets && items.length > 0 && <Graticule P={P} W={W} H={H} m={m} compact={compact} />}
        {!onStreets && <Districts items={nearItems} P={P} W={W} compact={compact} cities={cities} />}

        {onStreets && (
          <rect
            x={m + (compact ? 6 : 10)}
            y={m + (compact ? 8 : 10)}
            width={Math.max(title.length * (compact ? 13 : 18), subtitle.length * (compact ? 5.4 : 6.4)) + (compact ? 22 : 30)}
            height={compact ? 52 : 66}
            rx={4}
            fill={PAPER}
            fillOpacity={0.9}
            stroke={INK}
            strokeOpacity={0.35}
          />
        )}

        <text x={m + (compact ? 14 : 22)} y={m + (compact ? 34 : 44)} fontFamily={SERIF} fontSize={compact ? 22 : 30} fontWeight={600} fill={INK}>
          {title}
        </text>
        <text x={m + (compact ? 15 : 23)} y={m + (compact ? 50 : 64)} fontFamily={SERIF} fontStyle="italic" fontSize={compact ? 10 : 12} fill={FAINT}>
          {subtitle}
        </text>

        {items.length > 0 && <ScaleBar P={P} m={m} H={H} compact={compact} backed={onStreets} />}
        {/* Top right unless the inset is there; then bottom right on paper, or
            bottom left over the street map, whose credit and recentre button
            take the bottom right. */}
        <Compass
          cx={insetBox && onStreets ? m + (compact ? 40 : 58) : W - m - (compact ? 34 : 52)}
          cy={insetBox ? H - m - (compact ? 74 : 96) : m + (compact ? 46 : 62)}
          k={compact ? 0.7 : 1}
        />

        {(discovered ?? []).map((place) => {
          const [x, y] = P.xy(place.coordinates);
          if (x < m + 12 || x > W - m - 12 || y < m + 12 || y > H - m - 12) return null;
          const open = () => onDiscoveredClick?.(place);
          return (
            <g
              key={place.id}
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${place.name} — add to your trip`}
              data-testid="discovered-pin"
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onClick={open}
              onKeyDown={(e) => activate(e, open)}
            >
              <circle r={8} fill="#fff" fillOpacity={0.85} stroke={FOUND} strokeWidth={2} />
              <circle r={2.5} fill={FOUND} />
              <title>{place.name}</title>
            </g>
          );
        })}

        <Routes items={nearItems} P={P} />
        {nearItems.map((it) => (
          <Pin
            key={it.pin.activity.id}
            item={it}
            xy={P.xy(it.at)}
            selected={it.pin.activity.id === selectedActivityId}
            label={selectedDayIndex !== null && !compact}
            labelRight={P.xy(it.at)[0] < W / 2 + 120}
            onClick={() => onPinClick(it.pin)}
          />
        ))}

        {arrowItems.map((it) => (
          <EdgeArrow
            key={it.pin.activity.id}
            item={it}
            from={P.xy(mid)}
            to={P.xy(it.at)}
            km={haversineKm(mid, it.at)}
            dir={directionWord(mid, it.at)}
            box={{ x: m + 30, y: m + 30, w: W - 2 * m - 60, h: H - 2 * m - 60 }}
            onClick={() => onPinClick(it.pin)}
          />
        ))}

        {insetBox && insetItems.length > 0 && (
          <Inset
            items={insetItems}
            box={insetBox}
            from={mid}
            cityName={destinationName}
            plan={plan}
            compact={compact}
            selectedActivityId={selectedActivityId}
            onPinClick={onPinClick}
          />
        )}
      </svg>

      {onStreets && (
        <button
          type="button"
          onClick={() => setRecentre((n) => n + 1)}
          className="absolute right-3 bottom-10 z-[1] p-2 rounded-xl bg-[#f8f1e1]/95 border border-[#5b4a2e]/30 text-[#5b4a2e] shadow-card hover:bg-[#f8f1e1]"
          aria-label="Show the whole day again"
          title="Show the whole day again"
          data-testid="paper-recentre"
        >
          <LocateFixed size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Graticule({ P, W, H, m, compact }: { P: Projection; W: number; H: number; m: number; compact: boolean }) {
  const [west, north] = P.ll(m, m);
  const [east, south] = P.ll(W - m, H - m);
  const step = graticuleStep(Math.min(east - west, north - south), compact ? 4 : 6);
  const dp = step < 0.01 ? 3 : 2;
  const lines: JSX.Element[] = [];
  for (let lng = Math.ceil(west / step) * step; lng < east; lng += step) {
    const x = P.xy([lng, 0])[0];
    lines.push(<line key={`x${lng}`} x1={x} y1={m + 4} x2={x} y2={H - m - 4} stroke={FAINT} strokeWidth={0.6} strokeDasharray="2 5" />);
    if (!compact && x > 300) {
      lines.push(<text key={`xt${lng}`} x={x + 3} y={H - m - 10} fontSize={9} fill={FAINT} fontFamily={SERIF}>{lng.toFixed(dp)}°</text>);
    }
  }
  for (let lat = Math.ceil(south / step) * step; lat < north; lat += step) {
    const y = P.xy([0, lat])[1];
    lines.push(<line key={`y${lat}`} x1={m + 4} y1={y} x2={W - m - 4} y2={y} stroke={FAINT} strokeWidth={0.6} strokeDasharray="2 5" />);
    if (!compact && y > m + 90) {
      lines.push(<text key={`yt${lat}`} x={m + 8} y={y - 3} fontSize={9} fill={FAINT} fontFamily={SERIF}>{lat.toFixed(dp)}°</text>);
    }
  }
  return <g opacity={0.55} aria-hidden="true">{lines}</g>;
}

/** Neighbourhood names under their pins, faint, as on a printed map. */
function Districts({ items, P, W, compact, cities }: { items: Item[]; P: Projection; W: number; compact: boolean; cities: string[] }) {
  const groups = new Map<string, Array<[number, number]>>();
  for (const it of items) {
    const name = districtOf(it.pin.activity.locationName ?? '', it.pin.activity.name, cities);
    if (name) groups.set(name, [...(groups.get(name) ?? []), P.xy(it.at)]);
  }
  return (
    <g aria-hidden="true">
      {[...groups.entries()].map(([name, pts]) => {
        const half = name.length * (compact ? 5.5 : 8) + 10;
        const x = Math.min(Math.max(pts.reduce((s, p) => s + p[0], 0) / pts.length, 20 + half), W - 20 - half);
        const y = pts.reduce((s, p) => s + p[1], 0) / pts.length + (compact ? 16 : 20);
        return (
          <text key={name} x={x} y={y} textAnchor="middle" fontFamily={SERIF} fontStyle="italic"
            fontSize={compact ? 12 : 17} letterSpacing="0.22em" fill={FAINT} opacity={0.75}>
            {name.toUpperCase()}
          </text>
        );
      })}
    </g>
  );
}

/** Each day's stops joined in visiting order, with a gentle bow so it reads as drawn. */
function Routes({ items, P }: { items: Item[]; P: Projection }) {
  const byDay = new Map<number, Array<[number, number]>>();
  for (const it of items) byDay.set(it.pin.dayIndex, [...(byDay.get(it.pin.dayIndex) ?? []), P.xy(it.at)]);
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {[...byDay.entries()].map(([dayIndex, pts]) => {
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => {
          if (!i) return `M${p[0]},${p[1]}`;
          const q = pts[i - 1];
          const mx = (q[0] + p[0]) / 2 - (p[1] - q[1]) * 0.12;
          const my = (q[1] + p[1]) / 2 + (p[0] - q[0]) * 0.12;
          return `Q${mx},${my} ${p[0]},${p[1]}`;
        }).join(' ');
        return <path key={dayIndex} d={d} stroke={inkOf(getDayColor(dayIndex))} strokeWidth={2.4} strokeDasharray="1 7" opacity={0.9} data-testid="paper-route" />;
      })}
    </g>
  );
}

function Pin({ item, xy, selected, label, labelRight, onClick, small }: {
  item: Item;
  xy: [number, number];
  selected: boolean;
  label: boolean;
  labelRight: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  const { pin } = item;
  const color = getDayColor(pin.dayIndex);
  return (
    <g
      transform={`translate(${xy[0]},${xy[1]})${small ? ' scale(0.85)' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Pin ${pin.sequenceNumber}: ${pin.activity.name}`}
      aria-pressed={selected}
      data-testid="paper-pin"
      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      onClick={onClick}
      onKeyDown={(e) => activate(e, onClick)}
    >
      <ellipse cx={0} cy={1} rx={6} ry={2.2} fill="rgba(60,40,10,.25)" />
      {selected && <circle cx={0} cy={-21} r={17} fill="none" stroke="#0a0f1a" strokeWidth={2.5} />}
      <path d={PIN_PATH} fill={color} stroke={inkOf(color)} strokeWidth={selected ? 3 : 2} />
      <text x={0} y={-17} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0a0f1a" fontFamily={SANS}>
        {pin.sequenceNumber}
      </text>
      {label && (
        <text x={labelRight ? 16 : -16} y={-16} textAnchor={labelRight ? 'start' : 'end'} fontSize={13} fontWeight={600}
          fontFamily={SERIF} fill={INK} paintOrder="stroke" stroke={PAPER} strokeWidth={4}>
          {pin.activity.name}
        </text>
      )}
      <title>{pin.activity.name}</title>
    </g>
  );
}

function EdgeArrow({ item, from, to, km, dir, box, onClick }: {
  item: Item;
  from: [number, number];
  to: [number, number];
  km: number;
  dir: string;
  box: Box;
  onClick: () => void;
}) {
  const [x, y] = edgePoint(from, to, box);
  const angle = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  const color = getDayColor(item.pin.dayIndex);
  const lx = Math.min(Math.max(x, box.x + 70), box.x + box.w - 70);
  const below = to[1] < from[1];
  const text = `${item.pin.sequenceNumber}. ${item.pin.activity.name} · ${Math.round(km)} km ${dir}`;
  return (
    <g role="button" tabIndex={0} aria-label={`Pin ${item.pin.sequenceNumber}: ${item.pin.activity.name}, ${Math.round(km)} km ${dir}`}
      data-testid="paper-edge-arrow" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={onClick} onKeyDown={(e) => activate(e, onClick)}>
      <path d="M-14,-7 L4,0 L-14,7 Z" transform={`translate(${x},${y}) rotate(${angle})`} fill={color} stroke={inkOf(color)} strokeWidth={1.5} />
      <text x={lx} y={y + (below ? 26 : -14)} textAnchor="middle" fontSize={12} fontWeight={600} fontFamily={SERIF}
        fill={INK} paintOrder="stroke" stroke={PAPER} strokeWidth={4}>
        {text}
      </text>
    </g>
  );
}

/** A day trip in a box of its own, rather than the city shrunk to fit it. */
function Inset({ items, box, from, cityName, plan, compact, selectedActivityId, onPinClick }: {
  items: Item[];
  box: Box;
  from: LngLat;
  cityName: string;
  plan: Plan;
  compact: boolean;
  selectedActivityId?: string | null;
  onPinClick: (pin: PinActivity) => void;
}) {
  const dayIndex = items[0].pin.dayIndex;
  const day = plan.itinerary.find((d) => d.dayIndex === dayIndex);
  const place = day ? dayPlace(plan, day).split(',')[0].trim() : '';
  const where = place && place.toLowerCase() !== cityName.toLowerCase() ? place : null;
  const ink = inkOf(getDayColor(dayIndex));
  const P = fitProjection(items.map((i) => i.at), box, { l: 26, r: 26, t: compact ? 46 : 54, b: 16 });
  const pts = items.map((i) => P.xy(i.at));
  const km = Math.round(haversineKm(from, items[0].at));
  return (
    <g data-testid="paper-inset" style={{ pointerEvents: 'auto' }}>
      <rect x={box.x + 3} y={box.y + 4} width={box.w} height={box.h} fill="rgba(60,40,10,.12)" />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER_2} stroke={INK} strokeWidth={1.2} />
      <text x={box.x + 10} y={box.y + 18} fontSize={compact ? 11 : 13} fontWeight={600} fontFamily={SERIF} fill={ink}>
        {[day?.label.split(' — ')[0] ?? `Day ${dayIndex + 1}`, where].filter(Boolean).join(' · ')}
      </text>
      <text x={box.x + 10} y={box.y + (compact ? 31 : 34)} fontSize={compact ? 9 : 10.5} fontStyle="italic" fontFamily={SERIF} fill={FAINT}>
        {`${km} km ${directionWord(from, items[0].at)} of ${cityName}`}
      </text>
      {pts.length > 1 && (
        <path d={`M${pts.map((p) => p.join(',')).join(' L')}`} fill="none" stroke={ink} strokeWidth={2.2} strokeDasharray="1 6" strokeLinecap="round" />
      )}
      {items.map((it, i) => (
        <Pin key={it.pin.activity.id} item={it} xy={pts[i]} small selected={it.pin.activity.id === selectedActivityId}
          label={false} labelRight onClick={() => onPinClick(it.pin)} />
      ))}
    </g>
  );
}

function ScaleBar({ P, m, H, compact, backed }: { P: Projection; m: number; H: number; compact: boolean; backed?: boolean }) {
  const km = niceScaleKm(P.pxPerKm, compact ? 70 : 110);
  const len = km * P.pxPerKm;
  const x = m + (compact ? 14 : 22);
  const y = H - m - (compact ? 18 : 24);
  return (
    <g aria-label={`Scale: ${km < 1 ? `${km * 1000} metres` : `${km} km`}`} data-testid="paper-scale">
      {backed && <rect x={x - 8} y={y - 22} width={len + 16} height={28} rx={4} fill={PAPER} fillOpacity={0.9} />}
      <rect x={x} y={y - 4} width={len / 2} height={4} fill={INK} />
      <rect x={x + len / 2} y={y - 4} width={len / 2} height={4} fill={PAPER} stroke={INK} strokeWidth={1} />
      <text x={x} y={y - 9} fontSize={10} fill={INK} fontFamily={SERIF}>0</text>
      <text x={x + len} y={y - 9} fontSize={10} fill={INK} fontFamily={SERIF} textAnchor="end">
        {km < 1 ? `${km * 1000} m` : `${km} km`}
      </text>
    </g>
  );
}

function Compass({ cx, cy, k }: { cx: number; cy: number; k: number }) {
  return (
    <g transform={`translate(${cx},${cy}) scale(${k})`} opacity={0.8} aria-hidden="true">
      <circle r={22} fill="none" stroke={INK} strokeWidth={0.8} />
      <path d="M0,-30 L6,0 L0,6 L-6,0 Z" fill={INK} />
      <path d="M0,30 L6,0 L0,-6 L-6,0 Z" fill="none" stroke={INK} strokeWidth={0.8} />
      <path d="M-30,0 L0,4 L30,0 L0,-4 Z" fill="none" stroke={INK} strokeWidth={0.8} />
      <text y={-34} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK} fontFamily={SERIF}>N</text>
    </g>
  );
}
