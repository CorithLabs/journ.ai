import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PlusCircle,
  Settings,
  Menu,
  X,
  MapPin,
  Download,
  Compass,
  AlertTriangle,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import PlanContextMenu from '../plans/PlanContextMenu';
import { hasAnyAiKey } from '../../services/aiKeyStatus';

function formatDateRange(start: string, end: string): string {
  // Parse YYYY-MM-DD as a LOCAL date. `new Date('2025-03-14')` is parsed as UTC
  // midnight and then formatted in local time, which shifts the day back by one
  // for anyone in a timezone behind UTC (all of the Americas). Build from parts.
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { planId } = useParams<{ planId: string }>();
  const [collapsed, setCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    planId: string;
    x: number;
    y: number;
  } | null>(null);

  const { canInstall, triggerInstall } = usePwaInstall();

  // Read on every render rather than cached in state: the key is saved on the
  // Settings page, which doesn't unmount this sidebar, so a cached value would
  // keep showing the warning after the user has fixed it.
  const needsKey = !hasAnyAiKey();

  // IMPORTANT: Plan.deleted is a boolean (true/false), NOT a number.
  // Dexie's IndexableType does not include boolean in its TypeScript
  // definition, so the index-based queries either fail to compile under
  // `strict: true` or silently return zero results:
  //   .where('deleted').equals(0)                       -> false !== 0, no results
  //   .where('deleted').equals(false as unknown as ...) -> compile error / runtime footgun
  // The ONLY correct pattern is `.filter(p => !p.deleted).sortBy('createdAt')`,
  // which bypasses the Dexie index type restriction entirely, is TypeScript-safe,
  // and works correctly with boolean values.
  const plans = useLiveQuery(
    () => db.plans.filter((p) => !p.deleted).sortBy('createdAt'),
    [],
  );

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const [showIosBanner, setShowIosBanner] = useState(false);

  const handleInstallClick = () => {
    if (isIos) {
      setShowIosBanner(true);
    } else {
      triggerInstall();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ planId: id, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      <aside
        data-testid="sidebar"
        className={`
          relative flex flex-col border-r border-white/5
          bg-surface-raised/75 backdrop-blur-glass
          transition-all duration-200 ease-in-out z-30
          ${collapsed
            ? 'w-14 md:w-14'
            : 'w-60 md:w-60 fixed md:relative inset-y-0 left-0'
          }
        `}
        aria-label="Navigation sidebar"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-white/5 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Compass size={20} className="text-accent shrink-0" aria-hidden="true" />
              <span className="text-base font-bold text-ink-primary tracking-tight truncate">
                Journ.ai
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-overlay transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* New Plan Button */}
        <div className="px-3 py-3 shrink-0">
          <button
            onClick={() => navigate('/plan/new')}
            className={`
              flex items-center gap-2 w-full rounded-xl px-3 py-2
              bg-accent hover:bg-accent-light text-ink-inverse font-semibold
              transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
              ${collapsed ? 'justify-center' : ''}
            `}
            aria-label="Create new plan"
          >
            <PlusCircle size={16} aria-hidden="true" />
            {!collapsed && <span className="text-sm">New Plan</span>}
          </button>
        </div>

        {/* Plan List */}
        <nav
          className="flex-1 min-h-0 overflow-y-auto px-2 pb-2"
          aria-label="Your plans"
        >
          {!plans ? (
            // Loading skeleton
            <div className="space-y-1 px-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-surface-overlay rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : plans.length === 0 ? (
            // Empty state
            !collapsed && (
              <div
                className="flex flex-col items-center justify-center gap-3 py-10 px-3 text-center"
                data-testid="sidebar-empty-state"
              >
                <MapPin
                  size={32}
                  className="text-accent-muted"
                  aria-hidden="true"
                />
                <p className="text-sm text-ink-muted">No trips yet</p>
                <p className="text-xs text-ink-muted">
                  Start your first trip by clicking &ldquo;New Plan&rdquo; above
                </p>
              </div>
            )
          ) : (
            <ul className="space-y-0.5" role="list">
              {plans.map((plan) => {
                const isActive = plan.id === planId;
                return (
                  <li key={plan.id}>
                    <button
                      onClick={() => navigate(`/plan/${plan.id}/itinerary`)}
                      onContextMenu={(e) => handleContextMenu(e, plan.id)}
                      className={`
                        flex items-center gap-2 w-full rounded-xl px-3 py-2
                        text-left transition-colors group
                        focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
                        ${isActive
                          ? 'bg-accent/10 border-l-2 border-accent text-ink-primary'
                          : 'hover:bg-surface-overlay text-ink-secondary border-l-2 border-transparent'
                        }
                      `}
                      aria-current={isActive ? 'page' : undefined}
                      title={plan.destination}
                    >
                      <MapPin
                        size={14}
                        className={isActive ? 'text-accent shrink-0' : 'text-ink-muted shrink-0'}
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {plan.destination}
                          </div>
                          <div className="text-xs text-ink-muted truncate">
                            {formatDateRange(plan.startDate, plan.endDate)}
                          </div>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* iOS install banner */}
        {showIosBanner && !collapsed && (
          <div className="px-3 py-2 mx-2 mb-2 rounded-xl bg-surface-overlay border border-white/10 text-xs text-ink-secondary">
            <p>To install: tap <strong>Share</strong> then <strong>Add to Home Screen</strong></p>
            <button
              className="mt-1 text-accent hover:underline"
              onClick={() => setShowIosBanner(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-2 py-3 border-t border-white/5 shrink-0 flex flex-col gap-1">
          {canInstall && (
            <button
              onClick={handleInstallClick}
              className={`
                flex items-center gap-2 w-full rounded-xl px-3 py-2
                text-ink-secondary hover:text-ink-primary hover:bg-surface-overlay
                transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
                ${collapsed ? 'justify-center' : ''}
              `}
              aria-label="Install app"
            >
              <Download size={16} aria-hidden="true" />
              {!collapsed && <span className="text-sm">Install App</span>}
            </button>
          )}
          <button
            onClick={() => navigate('/settings')}
            className={`
              flex items-center gap-2 w-full rounded-xl px-3 py-2
              text-ink-secondary hover:text-ink-primary hover:bg-surface-overlay
              transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none
              ${collapsed ? 'justify-center' : ''}
            `}
            aria-label={
              needsKey ? 'Open settings — API key required' : 'Open settings'
            }
            data-testid="sidebar-settings-btn"
          >
            <span className="relative shrink-0">
              <Settings size={16} aria-hidden="true" />
              {/* Without a key, nothing AI-driven works — surface it where the
                  fix is, rather than only failing at the point of use. */}
              {needsKey && (
                <AlertTriangle
                  size={10}
                  className="absolute -top-1 -right-1 text-status-warning fill-surface-raised"
                  aria-hidden="true"
                  data-testid="settings-key-alert"
                />
              )}
            </span>
            {!collapsed && <span className="text-sm">Settings</span>}
            {!collapsed && needsKey && (
              <span className="ml-auto text-[10px] text-status-warning">Set up key</span>
            )}
          </button>
        </div>
      </aside>

      {/* Context menu */}
      {contextMenu && (
        <PlanContextMenu
          planId={contextMenu.planId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
