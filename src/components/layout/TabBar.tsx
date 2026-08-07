import { useRef, KeyboardEvent } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  const isMobile = useIsMobile();
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
       * Phone: a floating pill fixed above the home indicator and inset from
       * both edges, so nothing is clipped by rounded screen corners or the
       * gesture area. A full-width in-flow bar was being cut at the edges.
       * Desktop: the ordinary top tab strip.
       */
      className={
        isMobile
          ? `fixed z-30 left-3 right-3 flex items-stretch gap-0.5
             bottom-[calc(0.75rem+env(safe-area-inset-bottom))]
             rounded-modal border border-white/10 shadow-glass
             bg-surface-raised/85 backdrop-blur-glass px-1.5 py-1.5`
          : 'flex items-end border-b border-white/5 bg-surface-raised/80 backdrop-blur-glass px-4 shrink-0'
      }
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
              flex items-center justify-center transition-colors
              focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
              ${isMobile
                /* Icon over label so four tabs fit a narrow screen without
                   truncating, with the whole cell as the tap target. */
                ? `flex-1 flex-col gap-0.5 py-1.5 rounded-xl min-w-0
                   ${isActive ? 'bg-accent/15 text-ink-primary' : 'text-ink-secondary'}`
                : `gap-1.5 px-4 py-3 text-sm font-medium border-b-2
                   ${isActive ? 'border-accent text-ink-primary' : 'border-transparent text-ink-secondary hover:text-ink-primary'}`
              }
            `}
            data-testid={`tab-${tab.key}`}
          >
            {tab.icon}
            <span className={isMobile ? 'text-[10px] leading-none truncate max-w-full' : ''}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
