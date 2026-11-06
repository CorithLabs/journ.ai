import { Banknote, Car, Droplets, Phone, Plug, Sparkles } from 'lucide-react';
import type { Plan } from '../../db';
import { countryFacts, plugLabel, plugsFit, tapWaterLabel, type CountryFacts } from '../../data/countryFacts';
import { tripCountries } from '../../utils/travel';
import { hasAnyAiKey } from '../../services/aiKeyStatus';
import { useAppStore } from '../../store';

/** The countries a trip visits that the guide knows, home left out. */
export function tripCountryFacts(plan: Plan): CountryFacts[] {
  const home = countryFacts(plan.origin?.countryCode ?? plan.origin?.country);
  const seen = new Set<string>();
  const out: CountryFacts[] = [];
  for (const c of [plan.countryCode, ...tripCountries(plan), plan.destination.split(',').pop()]) {
    const f = countryFacts(c);
    if (f && !seen.has(f.code) && f.code !== home?.code) {
      seen.add(f.code);
      out.push(f);
    }
  }
  return out;
}

const volts = (v: string) => Number(/\d+/.exec(v)?.[0] ?? 0);

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-accent/10 text-accent" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</p>
        <div className="text-sm text-ink-primary">{children}</div>
      </div>
    </div>
  );
}

/**
 * Know before you go: the plug, the voltage, who to call, the money, the tap
 * water and the side of the road, for each country the trip visits.
 *
 * From a built-in table, so it shows without a key and offline. Tipping,
 * phrases and scams vary too much to keep as data, so with a key they are
 * one tap away, asked of the chat and labelled as AI there.
 */
export default function KnowBeforeYouGo({ plan }: { plan: Plan }) {
  const askAgent = useAppStore((s) => s.askAgent);
  const countries = tripCountryFacts(plan);
  if (!countries.length) return null;
  const home = countryFacts(plan.origin?.countryCode ?? plan.origin?.country);

  return (
    <section aria-labelledby="know-before" data-testid="know-before-you-go">
      <h2 id="know-before" className="text-sm font-semibold uppercase tracking-wider text-ink-secondary mb-2">
        Know before you go
      </h2>
      <div className="space-y-3">
        {countries.map((c) => {
          const fits = home ? plugsFit(home, c) : null;
          const voltageGap = home ? Math.abs(volts(home.voltage) - volts(c.voltage)) >= 50 : false;
          return (
            <div key={c.code} className="card-surface rounded-card px-4 py-2 divide-y divide-white/5" data-testid={`country-${c.code}`}>
              {countries.length > 1 && <p className="py-2 text-sm font-semibold text-ink-primary">{c.name}</p>}
              <Row icon={<Plug size={16} />} label="Plugs">
                {plugLabel(c.plugs)} · {c.voltage}
                {fits === false && <p className="text-xs text-status-warning">Your {plugLabel([home!.plugs[0]])} plugs need an adapter.</p>}
                {fits === true && <p className="text-xs text-ink-muted">Your plugs fit.</p>}
                {voltageGap && <p className="text-xs text-ink-muted">Check your chargers say 100–240 V; most phone and laptop ones do.</p>}
              </Row>
              <Row icon={<Phone size={16} />} label="Emergency">
                <span className="tabular-nums">{c.emergency}</span>
              </Row>
              <Row icon={<Banknote size={16} />} label="Money">
                {c.currency.name} ({c.currency.code})
              </Row>
              <Row icon={<Droplets size={16} />} label="Tap water">
                {tapWaterLabel(c.tapWater)}
              </Row>
              <Row icon={<Car size={16} />} label="Driving">
                On the {c.drives}
              </Row>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">A general guide — check before you go.</p>
      {hasAnyAiKey() && (
        <button
          type="button"
          onClick={() => askAgent(`What should I know about tipping, useful phrases and common scams in ${countries.map((c) => c.name).join(' and ')}?`)}
          className="mt-2 min-h-11 flex items-center gap-2 text-sm text-accent hover:underline"
          data-testid="ask-local-tips"
        >
          <Sparkles size={15} aria-hidden="true" /> Ask about tipping, phrases and scams
        </button>
      )}
    </section>
  );
}
