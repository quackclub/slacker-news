import { renderChart } from "./render";
import type { ChartSpec } from "./spec";

// Charts whose data never changes — the ones embedded in data articles — carry
// their spec inline and mount themselves. Dashboards with filters call
// `renderChart` directly instead.
function mountAll(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>("[data-chart-figure][data-chart-static]")
    .forEach((figure) => {
      if (figure.dataset.chartMounted === "true") return;

      const source = figure.querySelector<HTMLScriptElement>(
        "script[data-chart-spec]",
      );
      if (!source?.textContent) return;

      try {
        const spec = JSON.parse(source.textContent) as ChartSpec;
        figure.dataset.chartMounted = "true";
        renderChart(figure, spec);
      } catch (error) {
        console.error("Unable to mount chart", error);
      }
    });
}

function mountDocument(): void {
  mountAll(document);
}

mountDocument();
document.addEventListener("astro:page-load", mountDocument);
