// Chart palette.
//
// Deep, ink-like tones rather than bright brand colour: on a page of charts a
// saturated hue reads as shouting. They still have to clear the categorical
// checks, and desaturating them outright does not — below the chroma floor a
// colour reads as grey and adjacent pairs stop separating — so the subtlety
// comes from darkness, not from washing the colour out. Checked with the
// dataviz validator against the paper surface: lightness band, chroma floor,
// adjacent colour-vision-deficiency separation, normal-vision separation and
// contrast all pass in light mode.
//
// Dark mode on this site is a whole-page `invert(1) hue-rotate(180deg)` filter,
// so the dark steps are not chosen independently — they are these colours run
// through that filter. Re-validated that way, separation, chroma and contrast
// still pass; the slots land above the dark lightness band, which the filter
// gives us no way to correct without breaking the light palette.

// Ordered so the two hues that separate worst under colour-vision deficiency —
// the gold and the green — never sit next to each other.
export const SERIES_COLORS = [
  "#2a6a9b", // slate blue
  "#a82a3d", // brick
  "#96700c", // bronze
  "#742f96", // plum
  "#00795b", // pine
] as const;

/** De-emphasis / "Other" — never a categorical slot in its own right. */
export const OTHER_COLOR = "#6f7482";

/** One hue, light to dark, for magnitude (heatmaps, meters). */
export const SEQUENTIAL_RAMP = [
  "#eff3f7",
  "#d4dfea",
  "#b0c5d9",
  "#84a5c3",
  "#5686ab",
  "#2a6a9b",
] as const;

export const DELETION_COLORS = {
  message: SERIES_COLORS[0],
  thread: SERIES_COLORS[1],
} as const;

export function seriesColor(index: number): string {
  // Never generate or cycle a ninth hue: past the palette, everything is
  // "Other".
  return SERIES_COLORS[index] ?? OTHER_COLOR;
}
