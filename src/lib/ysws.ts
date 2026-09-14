// Ships data for the YSWS ("You Ship, We Ship") programs, as published by
// Otter. The same endpoint feeds the newswire ticker; this module keeps the
// full breakdowns the dashboard needs instead of the three ticker figures.

const STATS_URL = "https://otter.shymike.dev/api/v1/stats";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export type YswsOverview = {
  projects?: number;
  hours?: number;
  shippers?: number;
  programs?: number;
  countries?: number;
};

export type YswsProgram = {
  name: string;
  projects: number;
  hours: number;
  shippers: number;
};

export type YswsCountry = {
  code: string;
  projects: number;
  hours: number;
  shippers: number;
};

export type YswsMonth = {
  period: string;
  projects: number;
  hours: number;
};

export type YswsBucket = {
  bucket: string;
  count: number;
};

export type YswsDataset = {
  overview: YswsOverview;
  programs: YswsProgram[];
  countries: YswsCountry[];
  months: YswsMonth[];
  /** Monthly project counts for each program, keyed by program name. */
  monthsByProgram: Record<string, YswsMonth[]>;
  hoursPerShipper: YswsBucket[];
  submissionsPerShipper: YswsBucket[];
  fetchedAt: number;
};

type RawRow = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

let cache: { value: YswsDataset; expiresAt: number } | undefined;
let inFlight: Promise<YswsDataset> | undefined;

async function load(): Promise<YswsDataset> {
  const response = await fetch(STATS_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Otter stats responded ${response.status}`);

  const payload = (await response.json()) as {
    overview?: RawRow;
    by_ysws?: RawRow[];
    by_country?: RawRow[];
    projects_by_month?: RawRow[];
    hours_per_shipper_distribution?: RawRow[];
    submissions_per_shipper_distribution?: RawRow[];
  };

  const overviewRow = payload.overview ?? {};
  const overview: YswsOverview = {
    projects: optionalNumber(overviewRow.total_projects),
    hours: optionalNumber(overviewRow.total_hours),
    shippers: optionalNumber(overviewRow.unique_shippers),
    programs: optionalNumber(overviewRow.total_ysws),
    countries: optionalNumber(overviewRow.total_countries),
  };

  const programs = (payload.by_ysws ?? [])
    .map((row) => {
      const name = text(row.ysws);
      if (!name) return undefined;
      return {
        name,
        projects: num(row.total_projects),
        hours: num(row.total_hours),
        shippers: num(row.unique_shippers),
      };
    })
    .filter((row): row is YswsProgram => Boolean(row))
    .sort((a, b) => b.projects - a.projects);

  const countries = (payload.by_country ?? [])
    .map((row) => {
      const code = text(row.country_code);
      if (!code) return undefined;
      return {
        code,
        projects: num(row.total_projects),
        hours: num(row.total_hours),
        shippers: num(row.unique_shippers),
      };
    })
    .filter((row): row is YswsCountry => Boolean(row))
    .sort((a, b) => b.projects - a.projects);

  const monthTotals = new Map<string, YswsMonth>();
  const monthsByProgram: Record<string, YswsMonth[]> = {};

  for (const row of payload.projects_by_month ?? []) {
    const period = text(row.period);
    if (!period) continue;

    const projects = num(row.total_projects);
    const hours = num(row.total_hours);

    const total = monthTotals.get(period) ?? { period, projects: 0, hours: 0 };
    total.projects += projects;
    total.hours += hours;
    monthTotals.set(period, total);

    const program = text(row.ysws);
    if (!program) continue;
    (monthsByProgram[program] ??= []).push({ period, projects, hours });
  }

  for (const rows of Object.values(monthsByProgram)) {
    rows.sort((a, b) => a.period.localeCompare(b.period));
  }

  const buckets = (rows: RawRow[] | undefined): YswsBucket[] =>
    (rows ?? [])
      .map((row) => {
        const bucket = text(row.bucket);
        return bucket ? { bucket, count: num(row.count) } : undefined;
      })
      .filter((row): row is YswsBucket => Boolean(row));

  return {
    overview,
    programs,
    countries,
    months: [...monthTotals.values()].sort((a, b) =>
      a.period.localeCompare(b.period),
    ),
    monthsByProgram,
    hoursPerShipper: buckets(payload.hours_per_shipper_distribution),
    submissionsPerShipper: buckets(
      payload.submissions_per_shipper_distribution,
    ),
    fetchedAt: Date.now(),
  };
}

export async function getYswsDataset(): Promise<YswsDataset> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inFlight) return inFlight;

  inFlight = load()
    .then((value) => {
      cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    })
    .catch((error) => {
      if (cache) return cache.value;
      throw error;
    })
    .finally(() => {
      inFlight = undefined;
    });

  return inFlight;
}
