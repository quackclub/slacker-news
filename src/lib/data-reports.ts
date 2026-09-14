import { getCollection, type CollectionEntry } from "astro:content";

export type DataReport = {
  slug: string;
  url: string;
  title: string;
  excerpt: string;
  author?: string | string[];
  dashboard?: string;
  date: Date;
  dateLabel: string;
  readingTime: number;
  entry: CollectionEntry<"dataReports">;
};

const WORDS_PER_MINUTE = 200;

function readingTime(body: string | undefined): number {
  const words = (body ?? "")
    .replace(/^import\s.+$/gm, "")
    .replace(/^export\s.+$/gm, "")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function formatReportDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function getDataReports(): Promise<DataReport[]> {
  const entries = await getCollection("dataReports");

  return entries
    .map((entry) => {
      const slug = entry.id.replace(/\.mdx$/, "");
      return {
        slug,
        url: `/data/reports/${slug}/`,
        title: entry.data.title,
        excerpt: entry.data.excerpt,
        author: entry.data.author,
        dashboard: entry.data.dashboard,
        date: entry.data.date,
        dateLabel: formatReportDate(entry.data.date),
        readingTime: readingTime(entry.body),
        entry,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function getDataReport(
  slug: string,
): Promise<DataReport | undefined> {
  return (await getDataReports()).find((report) => report.slug === slug);
}
