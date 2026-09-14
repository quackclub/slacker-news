import { formatFullDate, formatNumber } from "./format";
import type { ChartSpec, TableView } from "./spec";

/**
 * Every chart has a table twin. It is built from the same spec, on the server
 * for static charts and in the browser for filtered ones, so no value is ever
 * reachable only by hovering.
 */
export function buildTable(spec: ChartSpec): TableView {
  switch (spec.type) {
    case "timeseries": {
      const series = spec.series;
      const days = new Set<string>();
      for (const entry of series) {
        for (const point of entry.data) days.add(point.time);
      }

      const sorted = [...days].sort();
      const lookup = series.map(
        (entry) =>
          new Map(entry.data.map((point) => [point.time, point.value])),
      );

      return {
        columns: ["Date", ...series.map((entry) => entry.label)],
        rows: sorted.map((day) => [
          formatFullDate(day),
          ...lookup.map((map) => {
            const value = map.get(day);
            return value === undefined ? "—" : formatNumber(value);
          }),
        ]),
        numeric: series.map((_, index) => index + 1),
      };
    }

    case "bars": {
      const legend = spec.legend ?? [];
      const columns =
        legend.length > 1
          ? ["", ...legend.map((entry) => entry.label), "Total"]
          : ["", spec.valueLabel ?? "Value"];

      return {
        columns,
        rows: spec.rows.map((row) => {
          const total = row.segments.reduce(
            (sum, segment) => sum + segment.value,
            0,
          );
          if (legend.length <= 1) return [row.label, formatNumber(total)];

          const byKey = new Map(
            row.segments.map((segment) => [segment.key, segment.value]),
          );
          return [
            row.label,
            ...legend.map((entry) => formatNumber(byKey.get(entry.key) ?? 0)),
            formatNumber(total),
          ];
        }),
        numeric: columns.map((_, index) => index).filter((index) => index > 0),
      };
    }

    case "columns":
      return {
        columns: [spec.categoryLabel ?? "", spec.valueLabel ?? "Value"],
        rows: spec.bars.map((bar) => [bar.label, formatNumber(bar.value)]),
        numeric: [1],
      };

    case "donut": {
      const total = spec.slices.reduce((sum, slice) => sum + slice.value, 0);
      return {
        columns: ["", "Value", "Share"],
        rows: spec.slices.map((slice) => [
          slice.label,
          formatNumber(slice.value),
          total > 0 ? `${((slice.value / total) * 100).toFixed(1)}%` : "—",
        ]),
        numeric: [1, 2],
      };
    }

    case "heatmap":
      return {
        columns: [spec.rowLabel ?? "", ...spec.columns],
        rows: spec.rows.map((row, rowIndex) => [
          row,
          ...spec.columns.map((_, columnIndex) => {
            const value = spec.values[rowIndex]?.[columnIndex];
            return value === null || value === undefined
              ? "—"
              : formatNumber(value);
          }),
        ]),
        numeric: spec.columns.map((_, index) => index + 1),
      };
  }
}
