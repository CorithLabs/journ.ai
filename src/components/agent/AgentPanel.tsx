import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, X, Send, AlertTriangle, PanelRight } from 'lucide-react';
import { db } from '../../db';
import { useAppStore, type ActiveTab } from '../../store';
import { hasStoredKey } from '../../services/aiKey';
import { useAgentChat } from './useAgentChat';
import Markdown from './Markdown';
import { openingSuggestions } from './suggestions';
import { useDraggablePanel, isDraggableViewport } from './useDraggablePanel';
import { fieldOnCardAuto } from '../ui/formStyles';

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
/**
 * Something to tap instead of something to type.
 *
 * Under the message rather than in the composer: they belong to the reply that
 * offered them, and a row pinned above the input would still be showing the
 * first turn's suggestions on the fifth.
 */
function SuggestionPills({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2" data-testid="agent-suggestions">
      {suggestions.map((s, i) => (
        <button
          key={`${s}-${i}`}
          type="button"
          onClick={() => onPick(s)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          data-testid={`agent-suggestion-${i}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function AgentPanel({ planId }: Props) {
  const open = useAppStore((s) => s.agentPanelOpen);
  const setOpen = useAppStore((s) => s.setAgentPanelOpen);
  const activeTab = useAppStore((s) => s.activeTab);
  const messages = useAppStore((s) => s.agentMessages);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const { position, dragging, onHandlePointerDown, reset } = useDraggablePanel(panelRef);
  // Below the breakpoint the panel is full-screen, so a stored position from a
  // desktop session must not turn it into a floating box on a phone.
  const canDrag = isDraggableViewport();
  const floating = canDrag && position !== null;

  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  // Only for the opening suggestions — what is still open is one of the more
  // useful things to be asked before anything has been said.
  const todos = useLiveQuery(() => db.todos.where('planId').equals(planId).toArray(), [planId]);
  const { send, busy } = useAgentChat(plan);

  /*
   * Tapping a pill sends it as though it had been typed, so the thread reads
   * the same either way and the assistant sees a normal request.
   */
  const ask = (text: string) => {
    if (busy || !keyConfigured) return;
    setInput('');
    void send(text);
  };

  // Only the newest reply offers follow-ups; an older turn's are answers to a
  // question that has already moved on.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

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
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="AI agent"
      data-testid="agent-panel"
      // Docked to the right edge until dragged. Once moved it becomes a
      // floating pane: fixed at an explicit offset, with a height that leaves
      // room to breathe rather than filling the viewport.
      className={`fixed z-40 flex flex-col border border-white/10 shadow-glass
        bg-surface-raised/85 backdrop-blur-glass
        ${floating
          ? 'w-[380px] max-h-[calc(100dvh-4rem)] h-[560px] rounded-card'
          : 'inset-y-0 right-0 w-full sm:w-[380px] border-y-0 border-r-0'}
        ${dragging ? 'select-none' : 'transition-shadow'}`}
      style={
        floating
          ? { left: position!.x, top: position!.y, right: 'auto', bottom: 'auto' }
          : undefined
      }
    >
      {/* Header — also the drag handle */}
      <div
        onPointerDown={onHandlePointerDown}
        className={`flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0
          ${canDrag ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        data-testid="agent-panel-handle"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-accent shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary truncate">AI Agent</p>
            <p className="text-xs text-ink-muted truncate" data-testid="agent-context">
              {plan?.destination ?? 'Plan'} · {TAB_LABELS[activeTab]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Only offered once moved — nothing to undo before that. Also the
              keyboard-reachable way back, since dragging is pointer-only. */}
          {floating && (
            <button
              onClick={reset}
              className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
              aria-label="Dock AI agent to the right"
              title="Dock to the right"
              data-testid="agent-dock"
            >
              <PanelRight size={18} />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg text-ink-muted hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
            aria-label="Close AI agent"
            data-testid="agent-close"
          >
            <X size={20} />
          </button>
        </div>
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
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" data-testid="agent-messages">
        {messages.length === 0 && keyConfigured && (
          <p className="text-sm text-ink-muted">
            Ask me to add activities, tick off to-dos, or save something to your clipboard.
          </p>
        )}
        {/* The empty composer is where the blank-page problem is worst, and
            the app knows what is worth doing before anything has been said. */}
        {messages.filter((m) => m.role !== 'system').length === 0 && (
          <SuggestionPills
            suggestions={openingSuggestions(plan, todos ?? [])}
            onPick={ask}
            disabled={busy || !keyConfigured}
          />
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
              {/* The user's own text is shown verbatim; only model output is
                  markdown, and rendering the user's input would mangle a
                  question that happens to contain * or _. */}
              {m.role === 'user' ? (
                <span className="whitespace-pre-wrap break-words">{m.content}</span>
              ) : (
                <Markdown content={m.content} />
              )}
              {/* Only on the newest reply. An older turn's follow-ups are
                  answers to a question that has already moved on. */}
              {m.role === 'assistant' && m.id === lastAssistantId && (
                <SuggestionPills
                  suggestions={m.suggestions ?? []}
                  onPick={ask}
                  disabled={busy || !keyConfigured}
                />
              )}
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
          className={`flex-1 ${fieldOnCardAuto}`}
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
