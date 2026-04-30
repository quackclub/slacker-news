import { generateAbacusKey, getAbacusGetUrl } from "./abacus.js";
import { getPosts, getSiteConfig } from "./content.js";
import { db, PageStats, PageStatsHistory } from "astro:db";

export const ONE_HOUR = 60 * 60 * 1000;

export async function getStatsData() {
  const site = await getSiteConfig();
  const posts = await getPosts();
  const now = Date.now();

  const staticPaths = ["/", "/about/", "/submissions/", "/acknowledgements/", "/changelogs/", "/news/", "/opinion/", "/essays/", "/stats/"];

  const baseRows = [
    ...staticPaths.map((path) => ({
      key: generateAbacusKey(path),
      path,
      label: path === "/" ? "Homepage" : `${path.replace(/^\//, "").replace(/\/$/, "")}`,
      kind: "page",
      value: null,
    })),
    ...posts.map((post) => ({
      key: generateAbacusKey(post.url),
      path: post.url,
      label: post.title,
      kind: "article",
      value: null,
    })),
  ];

  const rowsByKey = new Map();
  for (const row of baseRows) {
    if (!rowsByKey.has(row.key)) {
      rowsByKey.set(row.key, row);
    }
  }

  const allRows = Array.from(rowsByKey.values());

  async function fetchLiveValue(key) {
    try {
      const response = await fetch(getAbacusGetUrl(key));
      if (!response.ok) return null;
      const data = await response.json();
      const value = Number(data?.value);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  async function refreshCache() {
    for (const row of allRows) {
      const liveValue = await fetchLiveValue(row.key);
      if (liveValue === null) continue;

      await db.insert(PageStats).values({
        key: row.key,
        path: row.path,
        label: row.label,
        kind: row.kind,
        value: liveValue,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: PageStats.key,
        set: { value: liveValue, updatedAt: now, path: row.path, label: row.label, kind: row.kind },
      });

      await db.insert(PageStatsHistory).values({
        key: row.key,
        value: liveValue,
        timestamp: now,
      });
    }
  }

  const cached = await db.select().from(PageStats);
  const needsRefresh = cached.length === 0 || cached.some(r => Number(r.updatedAt) + ONE_HOUR < now);

  if (needsRefresh) {
    try {
      await refreshCache();
    } catch (e) {
      console.warn("Failed to refresh cache:", e);
    }
  }

  const freshCache = await db.select().from(PageStats);
  const history = await db.select().from(PageStatsHistory).orderBy(PageStatsHistory.timestamp);

  const cacheMap = new Map(freshCache.map(r => [r.key, r]));

  for (const row of allRows) {
    const cached = cacheMap.get(row.key);
    if (cached) {
      row.value = cached.value;
    }
  }

  const pages = allRows.filter(r => r.kind === "page").sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const articles = allRows.filter(r => r.kind === "article").sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const news = articles.filter(r => r.path.startsWith("/news/"));
  const essays = articles.filter(r => !r.path.startsWith("/news/"));

  const totalValue = freshCache.reduce((sum, r) => sum + Number(r.value), 0);

  const chartData = history.reduce((acc, entry) => {
    const ts = Number(entry.timestamp);
    const date = new Date(ts).toISOString().split("T")[0];
    if (!acc[date]) acc[date] = { date, total: 0 };
    acc[date].total += Number(entry.value);
    return acc;
  }, {});

  const chartLabels = Object.values(chartData).map(d => d.date);
  const chartValues = Object.values(chartData).map(d => d.total);

  return { site, pages, news, essays, totalValue, chartLabels, chartValues };
}
