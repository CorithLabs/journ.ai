import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, X, Send, AlertTriangle } from 'lucide-react';
import { db } from '../../db';
import { useAppStore, type ActiveTab } from '../../store';
import { hasStoredKey } from '../../services/aiKey';
import { useAgentChat } from './useAgentChat';

interface Props {
  planId: string;
}

const TAB_LABELS: Record<ActiveTab, string> = {
  itinerary: 'Itinerary',
  todo: 'To-Do',
  map: 'Map',
  clipboard: 'Clipboard',
};

/**
 * Persistent AI agent panel. Slides in from the right (full-screen on mobile).
 * Conversation history lives in the Zustand session store so it survives tab
 * switches within the same plan session (cleared on page reload).
 */
export default function AgentPanel({ planId }: Props) {
  const open = useAppStore((s) => s.agentPanelOpen);
  const setOpen = useAppStore((s) => s.setAgentPanelOpen);
  const activeTab = useAppStore((s) => s.activeTab);
  const messages = useAppStore((s) => s.agentMessages);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  const { send, busy } = useAgentChat(plan);

  // A key may exist; hasStoredKey is a cheap synchronous presence check.
  const keyConfigured = hasStoredKey();

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await send(text);
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="AI agent"
      data-testid="agent-panel"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] bg-surface-raised border-l border-white/10 shadow-glass flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-accent shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary truncate">AI Agent</p>
            <p className="text-xs text-ink-muted truncate" data-testid="agent-context">
              {plan?.destination ?? 'Plan'} · {TAB_LABELS[activeTab]}
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Close AI agent"
          data-testid="agent-close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Degraded banner when no key configured */}
      {!keyConfigured && (
        <div
          role="status"
          className="flex items-start gap-2 m-3 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl"
          data-testid="agent-no-key-banner"
        >
          <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-status-warning">
            Set up your API key in Settings to use the AI agent.
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="agent-messages">
        {messages.length === 0 && keyConfigured && (
          <p className="text-sm text-ink-muted">
            Ask me to add activities, tick off to-dos, or save something to your clipboard.
          </p>
        )}
        {messages
          .filter((m) => m.role !== 'system')
          .map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-accent/15 text-ink-primary'
                  : 'bg-surface-overlay text-ink-secondary'
              }`}
              data-testid={`agent-msg-${m.role}`}
            >
              {m.content}
            </div>
          ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-ink-muted" data-testid="agent-thinking">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="p-3 border-t border-white/5 shrink-0 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={keyConfigured ? 'Message the agent…' : 'Add a key in Settings first'}
          disabled={!keyConfigured || busy}
          aria-label="Message the AI agent"
          data-testid="agent-input"
          className="flex-1 bg-surface-overlay border border-white/10 rounded-xl px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!keyConfigured || busy || !input.trim()}
          aria-label="Send"
          data-testid="agent-send"
          className="p-2 rounded-xl bg-accent hover:bg-accent-light disabled:opacity-50 text-ink-inverse transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
