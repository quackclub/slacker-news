import { toDayKey } from "./charts/format";
import type { DeletionEvent, DeletionKind } from "./prometheus";

export type DeletionFilters = {
  /** Inclusive, epoch milliseconds. */
  from?: number;
  /** Inclusive, epoch milliseconds. */
  to?: number;
  channelId?: string;
  actorId?: string;
  kind?: DeletionKind;
};

export function filterEvents(
  events: DeletionEvent[],
  filters: DeletionFilters,
): DeletionEvent[] {
  return events.filter((event) => {
    if (filters.from !== undefined && event.at < filters.from) return false;
    if (filters.to !== undefined && event.at > filters.to) return false;
    if (filters.channelId && event.channelId !== filters.channelId)
      return false;
    if (filters.actorId && event.actorId !== filters.actorId) return false;
    if (filters.kind && event.kind !== filters.kind) return false;
    return true;
  });
}

export type DailyPoint = {
  day: string;
  messages: number;
  threads: number;
  total: number;
  removed: number;
};

const DAY_MS = 86_400_000;

/**
 * One row per calendar day between the bounds, quiet days included — a gap in
 * a deletion log means "nothing happened", not "no data".
 */
export function dailySeries(
  events: DeletionEvent[],
  bounds?: { from: number; to: number },
): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();

  const blank = (day: string): DailyPoint => ({
    day,
    messages: 0,
    threads: 0,
    total: 0,
    removed: 0,
  });

  for (const event of events) {
    const day = toDayKey(event.at);
    const point = byDay.get(day) ?? blank(day);
    if (event.kind === "thread") point.threads++;
    else point.messages++;
    point.total++;
    point.removed += event.removed;
    byDay.set(day, point);
  }

  const start = bounds?.from ?? events[0]?.at;
  const end = bounds?.to ?? events[events.length - 1]?.at;
  if (start === undefined || end === undefined) {
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  const filled: DailyPoint[] = [];
  for (
    let cursor = Date.parse(`${toDayKey(start)}T00:00:00Z`);
    cursor <= Date.parse(`${toDayKey(end)}T00:00:00Z`);
    cursor += DAY_MS
  ) {
    const day = toDayKey(cursor);
    filled.push(byDay.get(day) ?? blank(day));
  }
  return filled;
}

export function rollingAverage(
  points: DailyPoint[],
  field: keyof Omit<DailyPoint, "day">,
  window = 7,
): Array<{ day: string; value: number }> {
  const output: Array<{ day: string; value: number }> = [];
  let sum = 0;

  points.forEach((point, index) => {
    sum += point[field];
    if (index >= window) sum -= points[index - window][field];
    const span = Math.min(index + 1, window);
    output.push({ day: point.day, value: sum / span });
  });

  return output;
}

export type GroupTotals = {
  key: string;
  messages: number;
  threads: number;
  total: number;
  removed: number;
};

function groupBy(
  events: DeletionEvent[],
  pick: (event: DeletionEvent) => string | undefined,
  unknownKey: string,
): GroupTotals[] {
  const totals = new Map<string, GroupTotals>();

  for (const event of events) {
    const key = pick(event) ?? unknownKey;
    const row = totals.get(key) ?? {
      key,
      messages: 0,
      threads: 0,
      total: 0,
      removed: 0,
    };
    if (event.kind === "thread") row.threads++;
    else row.messages++;
    row.total++;
    row.removed += event.removed;
    totals.set(key, row);
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export const UNKNOWN_CHANNEL = "__unknown_channel__";
export const UNATTRIBUTED = "__unattributed__";

export function byChannel(events: DeletionEvent[]): GroupTotals[] {
  return groupBy(events, (event) => event.channelId, UNKNOWN_CHANNEL);
}

/**
 * Only the lines that name a moderator. Roughly a third of the log is written
 * without one, and folding those into an "unknown" row would read as a person.
 */
export function byActor(events: DeletionEvent[]): GroupTotals[] {
  return groupBy(
    events.filter((event) => event.actorId),
    (event) => event.actorId,
    UNATTRIBUTED,
  );
}

export type ThreadBucket = { key: string; label: string; count: number };

const THREAD_BUCKETS: Array<{
  key: string;
  label: string;
  test: (size: number) => boolean;
}> = [
  { key: "1", label: "1", test: (size) => size === 1 },
  { key: "2", label: "2", test: (size) => size === 2 },
  { key: "3-4", label: "3–4", test: (size) => size >= 3 && size <= 4 },
  { key: "5-9", label: "5–9", test: (size) => size >= 5 && size <= 9 },
  { key: "10-19", label: "10–19", test: (size) => size >= 10 && size <= 19 },
  { key: "20+", label: "20+", test: (size) => size >= 20 },
];

export function threadSizeBuckets(events: DeletionEvent[]): ThreadBucket[] {
  const counts = new Map<string, number>(
    THREAD_BUCKETS.map((bucket) => [bucket.key, 0]),
  );

  for (const event of events) {
    if (event.kind !== "thread" || event.threadSize === undefined) continue;
    const bucket = THREAD_BUCKETS.find((candidate) =>
      candidate.test(event.threadSize as number),
    );
    if (bucket) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
  }

  return THREAD_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: counts.get(bucket.key) ?? 0,
  }));
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday × hour counts, in UTC. */
export function weekdayHourMatrix(events: DeletionEvent[]): number[][] {
  const matrix = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));

  for (const event of events) {
    const date = new Date(event.at);
    matrix[date.getUTCDay()][date.getUTCHours()]++;
  }

  return matrix;
}

export type Summary = {
  total: number;
  messages: number;
  threads: number;
  removed: number;
  channels: number;
  actors: number;
  attributed: number;
  busiestDay?: DailyPoint;
  perDay: number;
};

export function summarize(
  events: DeletionEvent[],
  days: DailyPoint[],
): Summary {
  const messages = events.filter((event) => event.kind === "message").length;
  const threads = events.length - messages;
  const busiestDay = days.reduce<DailyPoint | undefined>(
    (best, day) => (!best || day.total > best.total ? day : best),
    undefined,
  );

  return {
    total: events.length,
    messages,
    threads,
    removed: events.reduce((sum, event) => sum + event.removed, 0),
    channels: new Set(
      events
        .map((event) => event.channelId)
        .filter((id): id is string => Boolean(id)),
    ).size,
    actors: new Set(
      events
        .map((event) => event.actorId)
        .filter((id): id is string => Boolean(id)),
    ).size,
    attributed: events.filter((event) => event.actorId).length,
    busiestDay,
    perDay: days.length > 0 ? events.length / days.length : 0,
  };
}
