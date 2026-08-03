import { Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';

/**
 * Floating "✦ AI" button fixed to the bottom-right of every tab.
 * Toggles the persistent AI agent panel.
 */
export default function AgentButton() {
  const open = useAppStore((s) => s.agentPanelOpen);
  const toggle = useAppStore((s) => s.toggleAgentPanel);

  // Hidden while the panel is open (the panel has its own close control).
  if (open) return null;

  return (
    <button
      onClick={toggle}
      data-testid="agent-fab"
      aria-label="Open AI agent"
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-accent hover:bg-accent-light text-ink-inverse font-semibold px-4 py-3 rounded-full shadow-glow transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
    >
      <Sparkles size={18} aria-hidden="true" />
      AI
    </button>
  );
}
