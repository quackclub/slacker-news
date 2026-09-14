import {
  AreaSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import { formatFullDate, formatNumber } from "./format";
import { buildTable } from "./table";
import type {
  BarsSpec,
  ChartSpec,
  ColumnsSpec,
  DonutSpec,
  HeatmapSpec,
  TimeSeriesSpec,
} from "./spec";

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // Every label in here is untrusted: channel names, moderator handles and
  // program names all arrive from an API.
  if (text !== undefined) node.textContent = text;
  return node;
}

function token(host: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(host).getPropertyValue(name).trim();
  return value || fallback;
}

function clear(node: HTMLElement): void {
  node.textContent = "";
}

type TooltipRow = { color?: string; label: string; value: string };

function tooltipFor(figure: HTMLElement): HTMLElement {
  let tooltip = figure.querySelector<HTMLElement>(".chart-tooltip");
  if (!tooltip) {
    tooltip = element("div", "chart-tooltip");
    tooltip.hidden = true;
    figure.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(
  figure: HTMLElement,
  title: string,
  rows: TooltipRow[],
  /**
   * Viewport coordinates of the mark the readout belongs to. `inside` pins the
   * readout just below the anchor — what a crosshair wants, since its "mark"
   * is the whole plot.
   */
  anchor: { x: number; top: number; bottom: number; inside?: boolean },
): void {
  const tooltip = tooltipFor(figure);
  clear(tooltip);

  tooltip.appendChild(element("div", "chart-tooltip-title", title));
  for (const row of rows) {
    const line = element("div", "chart-tooltip-row");
    if (row.color) {
      const key = element("span", "chart-tooltip-key");
      key.style.background = row.color;
      line.appendChild(key);
    }
    line.appendChild(element("span", "chart-tooltip-value", row.value));
    line.appendChild(element("span", "chart-tooltip-label", row.label));
    tooltip.appendChild(line);
  }

  tooltip.hidden = false;

  const bounds = figure.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const left = Math.min(
    Math.max(anchor.x - bounds.left - width / 2, 8),
    Math.max(bounds.width - width - 8, 8),
  );
  tooltip.style.left = `${left}px`;

  if (anchor.inside) {
    tooltip.style.top = `${anchor.top - bounds.top + 8}px`;
    return;
  }

  // Above the mark by preference; below it when there is no room, so the
  // readout never lands on top of the chart's own title.
  const above = anchor.top - bounds.top - tooltip.offsetHeight - 12;
  tooltip.style.top =
    above >= 4 ? `${above}px` : `${anchor.bottom - bounds.top + 12}px`;
}

function hideTooltip(figure: HTMLElement): void {
  const tooltip = figure.querySelector<HTMLElement>(".chart-tooltip");
  if (tooltip) tooltip.hidden = true;
}

/**
 * Wires hover and keyboard focus to the same readout, so a value is never
 * reachable by pointer alone.
 */
function bindMarkTooltip(
  figure: HTMLElement,
  mark: HTMLElement | SVGElement,
  title: string,
  rows: TooltipRow[],
): void {
  const show = (event: PointerEvent | FocusEvent) => {
    const bounds = (mark as HTMLElement).getBoundingClientRect();
    showTooltip(figure, title, rows, {
      x:
        event instanceof PointerEvent
          ? event.clientX
          : bounds.left + bounds.width / 2,
      top: bounds.top,
      bottom: bounds.bottom,
    });
  };

  mark.addEventListener("pointerenter", show as EventListener);
  mark.addEventListener("pointermove", show as EventListener);
  mark.addEventListener("pointerleave", () => hideTooltip(figure));
  mark.addEventListener("focus", show as EventListener);
  mark.addEventListener("blur", () => hideTooltip(figure));
}

// ─── Legend & table view ─────────────────────────────────────────────────────

type LegendEntry = { label: string; color: string; shape: "line" | "rect" };

function renderLegend(host: HTMLElement | null, entries: LegendEntry[]): void {
  if (!host) return;
  clear(host);

  // One series needs no legend box: the chart's title already names it.
  if (entries.length < 2) {
    host.hidden = true;
    return;
  }

  host.hidden = false;
  for (const entry of entries) {
    const item = element("span", "chart-legend-item");
    const key = element(
      "span",
      `chart-legend-key chart-legend-key--${entry.shape}`,
    );
    key.style.background = entry.color;
    item.appendChild(key);
    item.appendChild(element("span", "chart-legend-label", entry.label));
    host.appendChild(item);
  }
}

function renderTable(host: HTMLElement | null, spec: ChartSpec): void {
  if (!host) return;
  clear(host);

  const view = buildTable(spec);
  const table = element("table", "chart-table-grid");
  const numeric = new Set(view.numeric);

  const head = element("thead");
  const headRow = element("tr");
  view.columns.forEach((column, index) => {
    const cell = element(
      "th",
      numeric.has(index) ? "is-numeric" : undefined,
      column,
    );
    cell.scope = "col";
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = element("tbody");
  for (const row of view.rows) {
    const tr = element("tr");
    row.forEach((value, index) => {
      tr.appendChild(
        element("td", numeric.has(index) ? "is-numeric" : undefined, value),
      );
    });
    body.appendChild(tr);
  }
  table.appendChild(body);
  host.appendChild(table);
}

// ─── Time series ─────────────────────────────────────────────────────────────

type TimeSeriesState = {
  chart: IChartApi;
  series: Map<string, ISeriesApi<SeriesType>>;
  observer: ResizeObserver;
};

const timeSeriesStates = new WeakMap<HTMLElement, TimeSeriesState>();

function seriesDefinition(kind: TimeSeriesSpec["series"][number]["kind"]) {
  if (kind === "histogram") return HistogramSeries;
  if (kind === "area") return AreaSeries;
  return LineSeries;
}

function seriesOptions(
  entry: TimeSeriesSpec["series"][number],
  surface: string,
): Record<string, unknown> {
  if (entry.kind === "histogram") {
    return {
      color: entry.color,
      priceLineVisible: false,
      lastValueVisible: false,
    };
  }
  if (entry.kind === "area") {
    return {
      lineColor: entry.color,
      // An area fill is a wash, never a saturated block.
      topColor: `${entry.color}2b`,
      bottomColor: `${entry.color}00`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerBorderColor: surface,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerRadius: 4,
    };
  }
  return {
    color: entry.color,
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerBorderColor: surface,
    crosshairMarkerBorderWidth: 2,
    crosshairMarkerRadius: 4,
  };
}

function renderTimeSeries(
  figure: HTMLElement,
  plot: HTMLElement,
  spec: TimeSeriesSpec,
): void {
  const surface = token(figure, "--chart-surface", "#ffffff");
  const grid = token(figure, "--chart-grid", "#e6e6df");
  const muted = token(figure, "--chart-muted", "#6f7482");
  const height = spec.height ?? 260;

  // Bars only work while there are enough of them. Under about a fortnight of
  // points the library stretches each bar into a saturated block that touches
  // its neighbours, so the same data is drawn as a light area wash instead.
  const resolved = spec.series.map((entry) => ({
    ...entry,
    kind:
      entry.kind === "histogram" && entry.data.length <= 12
        ? ("area" as const)
        : entry.kind,
  }));

  const signature = resolved
    .map((entry) => `${entry.key}:${entry.kind}:${entry.color}`)
    .join("|");

  let state = timeSeriesStates.get(plot);
  if (state && plot.dataset.chartSignature !== signature) {
    state.observer.disconnect();
    state.chart.remove();
    timeSeriesStates.delete(plot);
    state = undefined;
  }

  if (!state) {
    clear(plot);
    const chart = createChart(plot, {
      height,
      autoSize: false,
      width: plot.clientWidth || 600,
      layout: {
        background: { color: "transparent" },
        textColor: muted,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: grid, style: 0 },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.15, bottom: 0.02 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: muted,
          width: 1,
          style: 0,
          labelVisible: false,
        },
        horzLine: { visible: false, labelVisible: false },
      },
      // A dashboard chart is read, not traded: panning and zooming only lose
      // the reader's place.
      handleScroll: false,
      handleScale: false,
      localization: {
        priceFormatter: (value: number) => formatNumber(value),
      },
    });

    const series = new Map<string, ISeriesApi<SeriesType>>();
    for (const entry of resolved) {
      series.set(
        entry.key,
        chart.addSeries(
          seriesDefinition(entry.kind),
          seriesOptions(entry, surface),
        ) as ISeriesApi<SeriesType>,
      );
    }

    const observer = new ResizeObserver(() => {
      const width = plot.clientWidth;
      if (width > 0) chart.applyOptions({ width });
    });
    observer.observe(plot);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        hideTooltip(figure);
        return;
      }

      const rows: TooltipRow[] = [];
      for (const entry of resolved) {
        const api = series.get(entry.key);
        if (!api) continue;
        const point = param.seriesData.get(api) as
          | { value?: number }
          | undefined;
        if (!point || typeof point.value !== "number") continue;
        rows.push({
          color: entry.color,
          label: entry.label,
          value: `${formatNumber(point.value)}${spec.unit ? ` ${spec.unit}` : ""}`,
        });
      }

      if (rows.length === 0) {
        hideTooltip(figure);
        return;
      }

      const bounds = plot.getBoundingClientRect();
      showTooltip(figure, formatFullDate(String(param.time)), rows, {
        x: bounds.left + param.point.x,
        top: bounds.top,
        bottom: bounds.bottom,
        inside: true,
      });
    });

    state = { chart, series, observer };
    timeSeriesStates.set(plot, state);
    plot.dataset.chartSignature = signature;
  }

  for (const entry of resolved) {
    state.series
      .get(entry.key)
      ?.setData(
        entry.data.map((point) => ({ time: point.time, value: point.value })),
      );
  }
  state.chart.timeScale().fitContent();
  state.chart.applyOptions({ height });
}

// ─── Bars ────────────────────────────────────────────────────────────────────

function renderBars(
  figure: HTMLElement,
  plot: HTMLElement,
  spec: BarsSpec,
): void {
  clear(plot);
  plot.classList.add("chart-bars");

  const totals = spec.rows.map((row) =>
    row.segments.reduce((sum, segment) => sum + segment.value, 0),
  );
  const max = Math.max(1, ...totals);

  spec.rows.forEach((row, index) => {
    const total = totals[index];
    const line = element("div", "chart-bar-row");

    const label = element("div", "chart-bar-label");
    if (row.href) {
      const link = element("a", undefined, row.label);
      link.href = row.href;
      link.rel = "noreferrer noopener";
      link.target = "_blank";
      label.appendChild(link);
    } else {
      label.textContent = row.label;
    }
    line.appendChild(label);

    const track = element("div", "chart-bar-track");
    const fill = element("div", "chart-bar-fill");
    fill.style.width = `${(total / max) * 100}%`;
    fill.tabIndex = 0;
    fill.setAttribute("role", "button");
    fill.setAttribute(
      "aria-label",
      `${row.label}: ${formatNumber(total)}${spec.unit ? ` ${spec.unit}` : ""}`,
    );

    for (const segment of row.segments) {
      if (segment.value <= 0) continue;
      const part = element("div", "chart-bar-segment");
      part.style.background = segment.color;
      part.style.flexGrow = String(segment.value);
      fill.appendChild(part);
    }

    const rows: TooltipRow[] =
      spec.legend && spec.legend.length > 1
        ? row.segments.map((segment) => ({
            color: segment.color,
            label: segment.label,
            value: formatNumber(segment.value),
          }))
        : [];
    rows.push({
      // With a split bar the summed row is the total; with one series the
      // measure's own name is all there is to say.
      label: rows.length > 0 ? "Total" : (spec.valueLabel ?? "Total"),
      value: `${formatNumber(total)}${spec.unit ? ` ${spec.unit}` : ""}`,
    });

    bindMarkTooltip(figure, fill, row.label, rows);

    track.appendChild(fill);
    line.appendChild(track);
    // The total lives outside the bar, so no label can ever be clipped by a
    // short one.
    line.appendChild(element("div", "chart-bar-value", formatNumber(total)));
    plot.appendChild(line);
  });

  if (spec.rows.length === 0) {
    plot.appendChild(
      element("p", "chart-empty", "No rows match the current filters."),
    );
  }
}

// ─── Columns ─────────────────────────────────────────────────────────────────

function renderColumns(
  figure: HTMLElement,
  plot: HTMLElement,
  spec: ColumnsSpec,
): void {
  clear(plot);
  plot.classList.add("chart-columns");

  const max = Math.max(1, ...spec.bars.map((bar) => bar.value));
  const peak = spec.bars.reduce(
    (best, bar) => (bar.value > best.value ? bar : best),
    spec.bars[0] ?? { key: "", label: "", value: 0 },
  );

  for (const bar of spec.bars) {
    const slot = element("div", "chart-column");
    const stack = element("div", "chart-column-stack");

    const fill = element("div", "chart-column-fill");
    fill.style.height = `${(bar.value / max) * 100}%`;
    fill.style.background = spec.color;
    fill.tabIndex = 0;
    fill.setAttribute("role", "button");
    fill.setAttribute(
      "aria-label",
      `${bar.label}: ${formatNumber(bar.value)}${spec.unit ? ` ${spec.unit}` : ""}`,
    );
    bindMarkTooltip(figure, fill, bar.label, [
      {
        color: spec.color,
        label: spec.valueLabel ?? "Value",
        value: `${formatNumber(bar.value)}${spec.unit ? ` ${spec.unit}` : ""}`,
      },
    ]);

    // Only the peak carries a direct label; the rest are in the tooltip and
    // the table.
    if (bar.key === peak.key && bar.value > 0) {
      stack.appendChild(
        element("span", "chart-column-cap", formatNumber(bar.value)),
      );
    }

    stack.appendChild(fill);
    slot.appendChild(stack);
    slot.appendChild(element("span", "chart-column-label", bar.label));
    plot.appendChild(slot);
  }

  if (spec.bars.length === 0) {
    plot.appendChild(
      element("p", "chart-empty", "No rows match the current filters."),
    );
  }
}

// ─── Donut ───────────────────────────────────────────────────────────────────

function renderDonut(
  figure: HTMLElement,
  plot: HTMLElement,
  spec: DonutSpec,
): void {
  clear(plot);
  plot.classList.add("chart-donut");

  const total = spec.slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    plot.appendChild(
      element("p", "chart-empty", "No rows match the current filters."),
    );
    return;
  }

  const size = 220;
  const stroke = 30;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // `chart-svg` opts the graphic out of the site-wide dark-mode image
  // re-inversion, so it flips with the page instead of against it.
  svg.setAttribute("class", "chart-svg chart-donut-svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("aria-hidden", "true");

  let offset = 0;
  for (const slice of spec.slices) {
    const length = (slice.value / total) * circumference;
    if (length <= 0) continue;

    const arc = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    arc.setAttribute("class", "chart-donut-arc");
    arc.setAttribute("cx", String(size / 2));
    arc.setAttribute("cy", String(size / 2));
    arc.setAttribute("r", String(radius));
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", slice.color);
    arc.setAttribute("stroke-width", String(stroke));
    // The surface gap is subtracted from each arc rather than drawn as a
    // border, so neighbours separate without extra ink.
    arc.setAttribute(
      "stroke-dasharray",
      `${Math.max(length - gap, 0.5)} ${circumference - Math.max(length - gap, 0.5)}`,
    );
    arc.setAttribute("stroke-dashoffset", String(-offset));
    arc.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);

    const share = ((slice.value / total) * 100).toFixed(1);
    bindMarkTooltip(figure, arc, slice.label, [
      {
        color: slice.color,
        label: `${share}% of total`,
        value: `${formatNumber(slice.value)}${spec.unit ? ` ${spec.unit}` : ""}`,
      },
    ]);

    svg.appendChild(arc);
    offset += length;
  }

  const wrap = element("div", "chart-donut-wrap");
  wrap.appendChild(svg);

  if (spec.centerValue) {
    const center = element("div", "chart-donut-center");
    center.appendChild(
      element("span", "chart-donut-center-value", spec.centerValue),
    );
    if (spec.centerLabel) {
      center.appendChild(
        element("span", "chart-donut-center-label", spec.centerLabel),
      );
    }
    wrap.appendChild(center);
  }

  plot.appendChild(wrap);
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function renderHeatmap(
  figure: HTMLElement,
  plot: HTMLElement,
  spec: HeatmapSpec,
): void {
  clear(plot);
  plot.classList.add("chart-heatmap");

  const flat = spec.values
    .flat()
    .filter((value): value is number => typeof value === "number");
  const max = Math.max(1, ...flat);

  const grid = element("div", "chart-heatmap-grid");
  grid.style.setProperty("--heatmap-columns", String(spec.columns.length));

  grid.appendChild(element("span", "chart-heatmap-corner", ""));
  spec.columns.forEach((column, index) => {
    // Label every third column so an hour axis does not turn into a smear.
    const label = element(
      "span",
      "chart-heatmap-column-label",
      index % 3 === 0 ? column : "",
    );
    grid.appendChild(label);
  });

  spec.rows.forEach((row, rowIndex) => {
    grid.appendChild(element("span", "chart-heatmap-row-label", row));

    spec.columns.forEach((column, columnIndex) => {
      const value = spec.values[rowIndex]?.[columnIndex] ?? null;
      const cell = element("span", "chart-heatmap-cell");

      if (value === null) {
        cell.classList.add("is-empty");
      } else {
        const step = Math.min(
          spec.ramp.length - 1,
          value === 0
            ? 0
            : Math.max(1, Math.round((value / max) * (spec.ramp.length - 1))),
        );
        cell.style.background = spec.ramp[step];
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        cell.setAttribute(
          "aria-label",
          `${row}, ${column}: ${formatNumber(value)}${spec.unit ? ` ${spec.unit}` : ""}`,
        );
        bindMarkTooltip(figure, cell, `${row} · ${column}`, [
          {
            label: spec.unit ?? "events",
            value: formatNumber(value),
          },
        ]);
      }

      grid.appendChild(cell);
    });
  });

  plot.appendChild(grid);

  const scale = element("div", "chart-heatmap-scale");
  scale.appendChild(element("span", "chart-heatmap-scale-label", "0"));
  for (const step of spec.ramp) {
    const swatch = element("span", "chart-heatmap-scale-step");
    swatch.style.background = step;
    scale.appendChild(swatch);
  }
  scale.appendChild(
    element("span", "chart-heatmap-scale-label", formatNumber(max)),
  );
  plot.appendChild(scale);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function legendEntries(spec: ChartSpec): LegendEntry[] {
  switch (spec.type) {
    case "timeseries": {
      // Secondary series (rolling averages) sit at the end of the legend.
      const ordered = [
        ...spec.series.filter((entry) => !entry.secondary),
        ...spec.series.filter((entry) => entry.secondary),
      ];
      return ordered.map((entry) => ({
        label: entry.label,
        color: entry.color,
        shape: entry.kind === "line" ? ("line" as const) : ("rect" as const),
      }));
    }
    case "bars":
      return (spec.legend ?? []).map((entry) => ({
        label: entry.label,
        color: entry.color,
        shape: "rect",
      }));
    case "donut":
      return spec.slices.map((slice) => ({
        label: slice.label,
        color: slice.color,
        shape: "rect",
      }));
    default:
      return [];
  }
}

export function renderChart(figure: HTMLElement, spec: ChartSpec): void {
  const plot = figure.querySelector<HTMLElement>("[data-chart-plot]");
  if (!plot) return;

  renderLegend(
    figure.querySelector<HTMLElement>("[data-chart-legend]"),
    legendEntries(spec),
  );

  switch (spec.type) {
    case "timeseries":
      renderTimeSeries(figure, plot, spec);
      break;
    case "bars":
      renderBars(figure, plot, spec);
      break;
    case "columns":
      renderColumns(figure, plot, spec);
      break;
    case "donut":
      renderDonut(figure, plot, spec);
      break;
    case "heatmap":
      renderHeatmap(figure, plot, spec);
      break;
  }

  renderTable(figure.querySelector<HTMLElement>("[data-chart-table]"), spec);
}
