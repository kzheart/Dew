export type Base = "live" | "preview";
export type Layout = "full" | "split";
export type Mode = "live" | "preview" | "edit" | "split";

/**
 * The segmented control keeps `base` while the source shows, so turning the source off returns to it,
 * and `layout` while it hides, so turning it on again shows it the way it last showed.
 */
export interface ViewState {
  base: Base;
  source: Layout | null;
  layout: Layout;
}

export type ViewAction =
  | { type: "base"; base: Base }
  | { type: "toggleSource" }
  | { type: "layout"; layout: Layout }
  /** ⌘/ and ⌥⌘/: show the source in a layout, or hide it when it already shows that way. */
  | { type: "toggleLayout"; layout: Layout }
  /** Double-click in the preview: show the source, in the layout it last showed in. */
  | { type: "locate" };

export function modeOf(s: ViewState): Mode {
  if (s.source === "full") return "edit";
  if (s.source === "split") return "split";
  return s.base;
}

export function viewReducer(s: ViewState, a: ViewAction): ViewState {
  switch (a.type) {
    case "base":
      return { ...s, base: a.base, source: null };
    case "toggleSource":
      return { ...s, source: s.source ? null : s.layout };
    case "layout":
      return s.source ? { ...s, source: a.layout, layout: a.layout } : s;
    case "toggleLayout":
      return { ...s, source: s.source === a.layout ? null : a.layout, layout: a.layout };
    case "locate":
      return { ...s, source: s.source ?? s.layout };
  }
}

