// Chart specs are plain data: a page (or an MDX article) describes what it
// wants plotted, and the renderer in `render.ts` turns that into DOM. Keeping
// them serialisable is what lets a static article embed a chart with no
// page-specific script.

export type TimeSeriesPoint = {
  /** `YYYY-MM-DD`. */
  time: string;
  value: number;
};

export type TimeSeriesSeries = {
  key: string;
  label: string;
  color: string;
  kind: "histogram" | "line" | "area";
  data: TimeSeriesPoint[];
  /** Kept out of the legend; used for rolling averages and other helpers. */
  secondary?: boolean;
};

export type TimeSeriesSpec = {
  type: "timeseries";
  series: TimeSeriesSeries[];
  unit?: string;
  height?: number;
};

export type BarSegment = {
  key: string;
  label: string;
  color: string;
  value: number;
};

export type BarRow = {
  key: string;
  label: string;
  href?: string;
  segments: BarSegment[];
};

export type BarsSpec = {
  type: "bars";
  rows: BarRow[];
  /** Legend order; omit for a single-series bar list. */
  legend?: Array<{ key: string; label: string; color: string }>;
  unit?: string;
  /** Caption for the value column in the table view. */
  valueLabel?: string;
};

export type ColumnsSpec = {
  type: "columns";
  bars: Array<{ key: string; label: string; value: number }>;
  color: string;
  unit?: string;
  valueLabel?: string;
  categoryLabel?: string;
};

export type DonutSpec = {
  type: "donut";
  slices: Array<{ key: string; label: string; value: number; color: string }>;
  centerValue?: string;
  centerLabel?: string;
  unit?: string;
};

export type HeatmapSpec = {
  type: "heatmap";
  rows: string[];
  columns: string[];
  /** Row-major values; `null` renders as an empty cell. */
  values: Array<Array<number | null>>;
  ramp: string[];
  unit?: string;
  rowLabel?: string;
  columnLabel?: string;
};

export type ChartSpec =
  | TimeSeriesSpec
  | BarsSpec
  | ColumnsSpec
  | DonutSpec
  | HeatmapSpec;

export type TableView = {
  columns: string[];
  rows: string[][];
  /** Column indexes rendered right-aligned with tabular figures. */
  numeric: number[];
};
