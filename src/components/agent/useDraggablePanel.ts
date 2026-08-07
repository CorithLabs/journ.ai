import { useCallback, useEffect, useState } from 'react';

/**
 * Drag-to-reposition for the agent panel.
 *
 * Pointer events rather than mouse events, so a touch drag works with the same
 * code path and pointer capture keeps the gesture alive if the finger or cursor
 * leaves the handle mid-drag.
 *
 * The position is stored as a top-left offset in pixels and persisted, so the
 * panel is where the user left it next session.
 */

const STORAGE_KEY = 'aitp_agent_panel_pos';

export interface PanelPosition {
  x: number;
  y: number;
}

/** Below this width the panel is full-screen, where dragging is meaningless. */
const DRAGGABLE_MIN_WIDTH = 640;

export function isDraggableViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= DRAGGABLE_MIN_WIDTH;
}

function readStored(): PanelPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    // Corrupt or unavailable storage is not worth failing over — the panel
    // simply opens in its default place.
    return null;
  }
}

/**
 * Keep the panel reachable. A window resized smaller — or a position saved on
 * a larger monitor — must never leave the panel off-screen with no way back.
 * The header is kept on screen rather than the whole panel, so a tall panel on
 * a short window still has its drag handle and close button in reach.
 */
export function clampToViewport(
  pos: PanelPosition,
  size: { width: number; height: number },
): PanelPosition {
  const margin = 8;
  const headerReach = 48;
  const maxX = Math.max(margin, window.innerWidth - size.width - margin);
  const maxY = Math.max(margin, window.innerHeight - headerReach);
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  };
}

export function useDraggablePanel(panelRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<PanelPosition | null>(readStored);
  const [dragging, setDragging] = useState(false);

  const persist = useCallback((pos: PanelPosition | null) => {
    try {
      if (pos) localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage full or blocked — the panel still moves for this session */
    }
  }, []);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggableViewport()) return;
      // Left button / touch / pen only — never start a drag on a right-click.
      if (e.button !== 0) return;
      const el = panelRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // Offset within the panel, so it doesn't jump to align its corner with
      // the cursor on the first move.
      const grabX = e.clientX - rect.left;
      const grabY = e.clientY - rect.top;

      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDragging(true);

      const move = (ev: PointerEvent) => {
        const next = clampToViewport(
          { x: ev.clientX - grabX, y: ev.clientY - grabY },
          { width: rect.width, height: rect.height },
        );
        setPosition(next);
      };

      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setPosition((current) => {
          persist(current);
          return current;
        });
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      // pointercancel fires when the gesture is interrupted (a system swipe,
      // a browser back-gesture). Without it the listeners would leak and the
      // panel would keep following the cursor.
      window.addEventListener('pointercancel', up);
    },
    [panelRef, persist],
  );

  /** Send the panel back to its docked position. */
  const reset = useCallback(() => {
    setPosition(null);
    persist(null);
  }, [persist]);

  // A stored position from a wider window can leave the panel unreachable.
  useEffect(() => {
    if (!position) return;
    const onResize = () => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition((p) =>
        p ? clampToViewport(p, { width: rect.width, height: rect.height }) : p,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position, panelRef]);

  return { position, dragging, onHandlePointerDown, reset };
}
