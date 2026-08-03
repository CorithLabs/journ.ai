import { useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { type Plan, type Day, db } from '../../db';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  plan: Plan;
  onGenerated: () => void;
}

const BUDGET_RANGES: Record<string, string> = {
  budget: 'budget (< $100/person/day)',
  mid: 'mid ($100\u2013$300/person/day)',
  premium: 'premium ($300\u2013$600/person/day)',
  luxury: 'luxury ($600+/person/day)',
};

function buildPrompt(plan: Plan): string {
  const intake = plan.intake;
  const budgetLabel = intake?.budgetRange
    ? BUDGET_RANGES[intake.budgetRange]
    : 'mid ($100\u2013$300/person/day)';
  return [
    'You are a travel planner. Generate a detailed day-by-day itinerary.',
    'Return ONLY valid JSON matching the schema. No markdown.',
    `Destination: ${plan.destination}`,
    `Dates: ${plan.startDate} to ${plan.endDate}`,
    `Travellers: ${intake?.numTravellers ?? 1}`,
    `Kids: ${intake?.kids ? 'yes, ages: ' + (intake.kidAges?.join(', ') ?? 'unknown') : 'no'}`,
    `Likes: ${intake?.likes?.join(', ') || 'general sightseeing'}`,
    `Dislikes: ${intake?.dislikes?.join(', ') || 'none'}`,
    `Budget: ${budgetLabel}`,
    'Rules: age-appropriate if kids, set budgetWarning:true if over budget.',
    'Return estimatedDailySpend {min,max,currency:"USD"} per day.',
    'Schema: {"days":[{"dayIndex":0,"label":"Day 1","estimatedDailySpend":{"min":80,"max":150,"currency":"USD"},"activities":[{"id":"uuid","name":"...","time":"09:00","locationName":"...","notes":"...","budgetWarning":false}]}]}',
  ].join('\n');
}

function parseDaySpend(
  raw: unknown,
): { min: number; max: number; currency: 'USD' } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const rawMin = typeof s.min === 'number' ? s.min : 0;
  const rawMax = typeof s.max === 'number' ? s.max : 0;
  const min = rawMin > rawMax ? rawMax : rawMin;
  const max = rawMin > rawMax ? rawMin : rawMax;
  return { min, max, currency: 'USD' };
}

function validateAndParseDays(raw: unknown): Day[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.days)) return null;

  return obj.days.map((d: unknown, i: number) => {
    const day = d as Record<string, unknown>;
    return {
      dayIndex: typeof day.dayIndex === 'number' ? day.dayIndex : i,
      label: typeof day.label === 'string' ? day.label : `Day ${i + 1}`,
      estimatedDailySpend: parseDaySpend(day.estimatedDailySpend),
      activities: Array.isArray(day.activities)
        ? (day.activities as unknown[]).map((a: unknown) => {
            const act = a as Record<string, unknown>;
            return {
              id: typeof act.id === 'string' ? act.id : uuidv4(),
              name: typeof act.name === 'string' ? act.name : 'Activity',
              time: typeof act.time === 'string' ? act.time : '09:00',
              locationName:
                typeof act.locationName === 'string' ? act.locationName : '',
              notes: typeof act.notes === 'string' ? act.notes : '',
              pinnedToTodo: false,
              budgetWarning: act.budgetWarning === true,
            };
          })
        : [],
    };
  });
}

async function getApiKey(): Promise<string | null> {
  try {
    const stored = localStorage.getItem('aitp_api_key');
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string };
    const deviceSalt = localStorage.getItem('aitp_device_salt');
    if (!deviceSalt) return null;
    const saltBytes = Uint8Array.from(atob(deviceSalt), (c) =>
      c.charCodeAt(0),
    );
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      saltBytes,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    );
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(16),
        info: new TextEncoder().encode('journ-ai-key'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const ivBytes = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(parsed.ciphertext), (c) =>
      c.charCodeAt(0),
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      derivedKey,
      cipherBytes,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function autoGenerateTodos(p: Plan): Promise<void> {
  const intake = p.intake;
  if (!intake) return;
  const existing = await db.todos.where('planId').equals(p.id).toArray();
  const existingTitles = new Set(existing.map((t) => t.title));
  const toAdd: Parameters<typeof db.todos.bulkAdd>[0] = [];
  const now = new Date().toISOString();

  if (!intake.flightsBooked) {
    const title = `Book flights to ${p.destination}`;
    if (!existingTitles.has(title)) {
      toAdd.push({
        id: uuidv4(),
        planId: p.id,
        title,
        category: 'Booking',
        status: 'todo',
        autoGenerated: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (!intake.accommodationBooked) {
    const title = 'Book accommodation for each night';
    if (!existingTitles.has(title)) {
      toAdd.push({
        id: uuidv4(),
        planId: p.id,
        title,
        category: 'Booking',
        status: 'todo',
        autoGenerated: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (intake.kids) {
    const title = `Check child entry requirements for ${p.destination}`;
    if (!existingTitles.has(title)) {
      toAdd.push({
        id: uuidv4(),
        planId: p.id,
        title,
        category: 'Document',
        status: 'todo',
        autoGenerated: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (toAdd.length > 0) await db.todos.bulkAdd(toAdd);
}

export default function GenerateItinerary({ plan, onGenerated }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');

  const generate = async () => {
    setStatus('generating');
    setError(null);
    setStreamText('');
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        setError('No API key configured. Please add your OpenAI API key in Settings.');
        setStatus('error');
        return;
      }
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: buildPrompt(plan) }],
          stream: true,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
      if (!response.ok) {
        const ed = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(ed.error?.message ?? `API error ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      let fullText = '';
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n').filter((l) => l.startsWith('data: '))) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const p2 = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
            fullText += p2.choices?.[0]?.delta?.content ?? '';
            setStreamText(fullText);
          } catch { /* ignore */ }
        }
      }
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      let parsed: unknown;
      try { parsed = JSON.parse(jsonMatch[0]); }
      catch {
        try { parsed = JSON.parse(jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')); }
        catch { throw new Error('Malformed JSON from AI — please retry'); }
      }
      const days = validateAndParseDays(parsed);
      if (!days) throw new Error('Invalid response structure from AI');
      await db.plans.update(plan.id, { itinerary: days, updatedAt: new Date().toISOString() });
      await autoGenerateTodos(plan);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center" data-testid="generate-itinerary">
      <Sparkles size={40} className="text-accent mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink-primary mb-2">Ready to generate your itinerary</h2>
      <p className="text-sm text-ink-secondary mb-6 max-w-sm">
        The AI will create a personalised day-by-day plan for{' '}
        <strong className="text-ink-primary">{plan.destination}</strong> based on your preferences.
      </p>
      {plan.intake?.budgetRange && (
        <div className="mb-4 text-xs text-accent bg-accent/10 px-3 py-1.5 rounded-full">
          Budget: {BUDGET_RANGES[plan.intake.budgetRange]}
        </div>
      )}
      {status === 'generating' && (
        <div className="w-full max-w-lg mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-label="Generating" />
            <span className="text-sm text-ink-secondary">Generating your itinerary…</span>
          </div>
          {streamText && (
            <div className="bg-surface-overlay rounded-xl p-3 text-xs text-ink-muted font-mono max-h-32 overflow-y-auto text-left">
              {streamText.slice(-500)}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-status-danger/10 border border-status-danger/20 rounded-xl max-w-sm">
          <AlertTriangle size={16} className="text-status-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-status-danger">{error}</p>
            <button className="text-xs text-accent hover:underline mt-1" onClick={generate}>Retry</button>
          </div>
        </div>
      )}
      {status !== 'generating' && (
        <button onClick={generate} className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-6 py-2.5 rounded-xl transition-colors" data-testid="start-generate-btn">
          <Sparkles size={16} aria-hidden="true" />
          Generate Itinerary
        </button>
      )}
    </div>
  );
}
