/**
 * boardView.js - the initial pan/zoom of the Transcendence board canvas.
 *
 * Board space is col 0..26, row 0..25 once BoardNode's CSS has shifted it (core at the bottom
 * centre), so the whole board spans 26 x 25 cells between node centres.
 */
export const BOARD_SPAN_COLS = 26;
export const BOARD_SPAN_ROWS = 25;
/** Room kept clear at the top for the zoom / reset controls that float over the viewport. */
export const TOOLS_CLEARANCE = 44;

/**
 * Zoom and pan that show the whole board, centred, below the floating controls. Never zooms in
 * past 1 and never below `minZoom` (a very small viewport then simply starts clipped).
 */
export function fitView(width, height, cell, node, minZoom = 0.25) {
  const pad = cell;
  const contentW = BOARD_SPAN_COLS * cell + node;
  const contentH = BOARD_SPAN_ROWS * cell + node;
  const availW = Math.max(1, width - 2 * pad);
  const availH = Math.max(1, height - TOOLS_CLEARANCE - pad);
  const zoom = Math.max(minZoom, Math.min(1, availW / contentW, availH / contentH));
  return {
    zoom,
    panX: width / 2 - (BOARD_SPAN_COLS / 2) * cell * zoom,
    panY: TOOLS_CLEARANCE + (availH - contentH * zoom) / 2 + (node / 2) * zoom,
  };
}
