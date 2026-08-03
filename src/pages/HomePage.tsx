import { useNavigate } from 'react-router-dom';
import { PlusCircle, Compass } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export default function HomePage() {
  const navigate = useNavigate();
  // IMPORTANT: Plan.deleted is a boolean (true/false), NOT a number.
  // Dexie's IndexableType does not include boolean in its TypeScript
  // definition, so index-based queries are unsafe:
  //   .where('deleted').equals(0)                       -> false !== 0, silently returns no results
  //   .where('deleted').equals(false as unknown as ...) -> throws DataError at runtime on Vercel
  //     (IDBKeyRange rejects a boolean bound: "The parameter is not a valid key")
  // The ONLY correct pattern is `.filter(p => !p.deleted).sortBy('createdAt')`,
  // which bypasses the Dexie index type restriction entirely, is TypeScript-safe
  // under `strict: true`, and works correctly with boolean values. This matches
  // the Sidebar query exactly.
  const plans = useLiveQuery(
    () => db.plans.filter((p) => !p.deleted).sortBy('createdAt'),
    [],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <Compass size={48} className="text-accent mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-ink-primary tracking-tight mb-2">
        Welcome to Journ.ai
      </h1>
      {plans && plans.length === 0 ? (
        <>
          <p className="text-sm text-ink-secondary mb-6 max-w-sm">
            Your AI-powered travel planner. Create your first trip and let the AI
            build a personalised day-by-day itinerary.
          </p>
          <button
            onClick={() => navigate('/plan/new')}
            className="flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-5 py-2.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          >
            <PlusCircle size={18} aria-hidden="true" />
            Start your first trip
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-secondary">
          Select a plan from the sidebar or{' '}
          <button
            onClick={() => navigate('/plan/new')}
            className="text-accent hover:underline"
          >
            create a new one
          </button>
          .
        </p>
      )}
    </div>
  );
}
