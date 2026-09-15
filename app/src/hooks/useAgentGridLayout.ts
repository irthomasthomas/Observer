// hooks/useAgentGridLayout.ts
//
// Backs the tiling agent grid in App.tsx: a react-grid-layout canvas where
// each AgentCard is a freely movable/resizable tile, sized in *absolute*
// pixels rather than as a proportion of the window.
//
// react-grid-layout's column model normally makes a tile's pixel width
// proportional to the container: a tile at half the grid's columns shrinks
// with the window, even if its absolute size would still comfortably fit.
// To get absolute sizing instead, the column count itself is derived from
// the container width so that one column is always ~COL_PX wide, regardless
// of how wide the container is — a tile's stored width in columns then maps
// to a roughly constant pixel width. It only shrinks once the window is
// genuinely too narrow to fit it (columns run out), at which point the tile
// is clamped down to the available width for rendering — without touching
// the persisted size, so it springs back to its original absolute size as
// soon as there's room again.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContainerWidth, type EventCallback, type LayoutItem } from 'react-grid-layout';
import { calcWHRaw, type PositionParams } from 'react-grid-layout/core';

// Target pixel width of one grid column — kept ~constant across container
// widths by deriving `cols` from the container (see colsForWidth below).
const COL_PX = 56;
export const GRID_ROW_HEIGHT = 8;
export const GRID_MARGIN: [number, number] = [16, 16];

const LAYOUT_KEY = 'observer_agent_grid_layout_v1';

// Default tile size — about half the page, same whether the agent is idle
// or running, clamped down to fit when the grid itself is narrower (mobile).
function defaultSizePx(): { width: number; height: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { width: Math.round(vw * 0.5), height: Math.round(vh * 0.5) };
}

function colsForWidth(containerWidth: number): number {
  return Math.max(1, Math.floor((containerWidth - GRID_MARGIN[0]) / (COL_PX + GRID_MARGIN[0])));
}

function positionParamsFor(containerWidth: number, cols: number): PositionParams {
  return {
    margin: GRID_MARGIN,
    containerPadding: GRID_MARGIN,
    containerWidth,
    cols,
    rowHeight: GRID_ROW_HEIGHT,
    maxRows: Infinity,
  };
}

function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useAgentGridLayout(agentIds: string[]) {
  // measureBeforeMount so `width` is never a wrong guess (e.g. desktop-sized
  // default width used to size a brand-new tile on a phone) — layout items
  // for new agents are only ever created once `mounted` reflects a real
  // measurement.
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const widthRef = useRef(width);
  widthRef.current = width;

  const cols = colsForWidth(width || 1);

  const persist = useCallback((next: LayoutItem[]) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // best-effort persistence — a full quota or private-mode failure just
      // means layout resets next reload, not worth surfacing to the user
    }
  }, []);

  // Give any agent that doesn't have a tile yet a default one, sized in
  // absolute pixels (clamped to the grid's current column count).
  useEffect(() => {
    if (!mounted) return;
    const missing = agentIds.filter(id => !layoutRef.current.some(item => item.i === id));
    if (missing.length === 0) return;

    const currentCols = colsForWidth(widthRef.current);
    const target = defaultSizePx();
    const { w, h } = calcWHRaw(
      positionParamsFor(widthRef.current, currentCols),
      target.width,
      target.height
    );
    const clampedW = Math.min(w, currentCols);

    let cursorY = layoutRef.current.reduce((max, it) => Math.max(max, it.y + it.h), 0);
    const additions: LayoutItem[] = missing.map(id => {
      const item: LayoutItem = { i: id, x: 0, y: cursorY, w: clampedW, h, minW: 3, minH: 8 };
      cursorY += h;
      return item;
    });

    persist([...layoutRef.current, ...additions]);
  }, [agentIds, mounted, persist]);

  // Render-time-only clamp: shrink a tile to fit the current column count
  // without mutating (or persisting) its stored absolute size, so it's back
  // to full size the moment the window is wide enough again.
  const renderLayout = useMemo(
    () =>
      layout.map(item => {
        const w = Math.min(item.w, cols);
        const x = Math.min(item.x, Math.max(0, cols - w));
        return w === item.w && x === item.x ? item : { ...item, w, x };
      }),
    [layout, cols]
  );

  // A drag only moves a tile — its stored (absolute) w/h must survive even
  // if the tile happened to be rendering clamped at the time. Other tiles
  // may have shifted purely from compaction, so their x/y follow along too.
  const onDragStop: EventCallback = useCallback((rawLayout, _oldItem, movedItem) => {
    if (!movedItem) return;
    const byId = new Map(layoutRef.current.map(item => [item.i, item]));
    const merged = rawLayout.map(entry => {
      const stored = byId.get(entry.i);
      if (!stored) return entry;
      return { ...stored, x: entry.x, y: entry.y };
    });
    persist(merged);
  }, [persist]);

  // A resize is the one interaction allowed to change the stored absolute
  // size — only for the tile actually being resized.
  const onResizeStop: EventCallback = useCallback((rawLayout, _oldItem, resizedItem) => {
    if (!resizedItem) return;
    const byId = new Map(layoutRef.current.map(item => [item.i, item]));
    const merged = rawLayout.map(entry => {
      const stored = byId.get(entry.i);
      if (!stored) return entry;
      if (entry.i === resizedItem.i) {
        return { ...stored, x: entry.x, y: entry.y, w: entry.w, h: entry.h };
      }
      return { ...stored, x: entry.x, y: entry.y };
    });
    persist(merged);
  }, [persist]);

  return { layout: renderLayout, onDragStop, onResizeStop, containerRef, width, cols, mounted };
}
