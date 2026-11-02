/** Zoom limits in percent. Code reflows its text; tables and charts scale further. */
export interface ZoomRange {
  min: number;
  max: number;
}

export const CODE_ZOOM: ZoomRange = { min: 60, max: 200 };
export const SHEET_ZOOM: ZoomRange = { min: 25, max: 400 };

const LADDER = [25, 33, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400];

export const clampZoom = (z: number, r: ZoomRange) => Math.min(r.max, Math.max(r.min, z));

/** The next step of the − / + buttons past zoom, within the range. */
export function stepZoom(zoom: number, dir: 1 | -1, r: ZoomRange): number {
  const steps = LADDER.filter((s) => s >= r.min && s <= r.max);
  const next = dir > 0 ? steps.find((s) => s > zoom + 0.5) : steps.reverse().find((s) => s < zoom - 0.5);
  return next ?? (dir > 0 ? r.max : r.min);
}

/**
 * Zoom after a wheel event. A trackpad pinch arrives as a wheel event with
 * ctrlKey and small deltas, so it scales faster per pixel than a wheel.
 */
export function wheelZoom(zoom: number, deltaY: number, pinch: boolean, r: ZoomRange): number {
  return clampZoom(zoom * Math.exp(-deltaY * (pinch ? 0.01 : 0.0015)), r);
}

/** The zoom that fits size into room, never past 200% or outside the range. */
export function fitZoom(size: { width: number; height: number }, room: { width: number; height: number }, r: ZoomRange): number {
  const z = Math.min(room.width / size.width, room.height / size.height) * 100;
  return Math.round(clampZoom(Math.min(z, 200), r));
}

export interface Point {
  x: number;
  y: number;
}

/** Content laid out in a scroller: its offset in the scrolled area and its size. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the pointer sits, as a fraction of the content, and where it is in the viewport. */
export interface Anchor {
  fx: number;
  fy: number;
  pointer: Point;
}

export function anchorAt(scroll: Point, pointer: Point, content: Box): Anchor {
  return {
    fx: (scroll.x + pointer.x - content.left) / content.width,
    fy: (scroll.y + pointer.y - content.top) / content.height,
    pointer,
  };
}

/** The scroll position that puts the anchored point of the content back under the pointer. */
export function scrollFor(a: Anchor, content: Box): Point {
  return {
    x: content.left + a.fx * content.width - a.pointer.x,
    y: content.top + a.fy * content.height - a.pointer.y,
  };
}
