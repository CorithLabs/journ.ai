import { Sparkles } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppStore } from '../../store';

/**
 * "✦ Ask AI", at the end of the tab bar on a desktop. Opens the AI agent panel.
 *
 * It used to float in the bottom-right corner of every tab, where it sat on
 * top of whatever was there: the map's recentre button, the corner of the
 * itinerary's side panel. Phones already had it in their bar; now the desktop
 * does too, so it never covers anything.
 */
export default function AgentButton() {
  // On phones the trigger lives in the bottom bar, so the floating button
  // would be a second control for the same thing sitting on top of it.
  const isMobile = useIsMobile();
  const open = useAppStore((s) => s.agentPanelOpen);
  const toggle = useAppStore((s) => s.toggleAgentPanel);

  // Hidden while the panel is open (the panel has its own close control).
  if (open) return null;
  // On phones the trigger lives in the bottom bar. Keeping this too would put
  // a second control for the same thing floating on top of it.
  if (isMobile) return null;

  return (
    <button
      onClick={toggle}
      data-testid="agent-fab"
      aria-label="Open AI agent"
      className="shrink-0 flex items-center gap-1.5 bg-accent hover:bg-accent-light text-ink-inverse text-sm font-semibold px-3.5 py-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
    >
      <Sparkles size={15} aria-hidden="true" />
      Ask AI
    </button>
  );
}
