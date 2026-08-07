import { useRef, KeyboardEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, CheckSquare, Map, Paperclip } from 'lucide-react';

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  {
    key: 'itinerary',
    label: 'Itinerary',
    path: 'itinerary',
    icon: <CalendarDays size={16} aria-hidden="true" />,
  },
  {
    key: 'todo',
    label: 'To-Do',
    path: 'todo',
    icon: <CheckSquare size={16} aria-hidden="true" />,
  },
  {
    key: 'map',
    label: 'Map',
    path: 'map',
    icon: <Map size={16} aria-hidden="true" />,
  },
  {
    key: 'clipboard',
    label: 'Clipboard',
    path: 'clipboard',
    icon: <Paperclip size={16} aria-hidden="true" />,
  },
];

interface Props {
  planId: string;
}

const STORAGE_KEY = (planId: string) => `journ_active_tab_${planId}`;

export default function TabBar({ planId }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeTab = TABS.find((t) =>
    location.pathname.endsWith(`/${t.path}`),
  )?.key ?? 'itinerary';

  const goTo = (tab: Tab) => {
    localStorage.setItem(STORAGE_KEY(planId), tab.key);
    navigate(`/plan/${planId}/${tab.path}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') {
      next = (index + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      next = (index - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = TABS.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    tabRefs.current[next]?.focus();
    goTo(TABS[next]);
  };

  return (
    <nav
      /*
       * Bottom on phones, top on desktop.
       *
       * `order-last` moves it below the content on small screens, where the
       * tabs are the primary navigation and need to sit in thumb reach; on a
       * desktop pointer that is unnecessary and bottom-anchored tabs read as
       * unconventional, so it returns to the top at md.
       *
       * The active indicator and divider swap edges to match: a top-border
       * indicator under a bottom bar would point away from the content it
       * belongs to. Padding accounts for the home-indicator inset on phones.
       */
      className="order-last md:order-first flex items-end
        border-t md:border-t-0 md:border-b border-white/5
        bg-surface-raised/80 backdrop-blur-glass px-4 shrink-0
        pb-[env(safe-area-inset-bottom)] md:pb-0"
      aria-label="Plan tabs"
      role="tablist"
      data-testid="tab-bar"
    >
      {TABS.map((tab, i) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            id={`tab-${tab.key}`}
            onClick={() => goTo(tab)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            tabIndex={isActive ? 0 : -1}
            className={`
              flex flex-1 md:flex-none items-center justify-center gap-1.5
              px-4 py-3 text-sm font-medium transition-colors
              focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
              border-t-2 border-b-0 md:border-t-0 md:border-b-2
              ${isActive
                ? 'border-accent text-ink-primary'
                : 'border-transparent text-ink-secondary hover:text-ink-primary'
              }
            `}
            data-testid={`tab-${tab.key}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
