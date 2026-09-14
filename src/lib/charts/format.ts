const integerFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const oneDecimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatInteger(value: number): string {
  return integerFormat.format(value);
}

export function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? integerFormat.format(value)
    : oneDecimalFormat.format(value);
}

export function formatCompact(value: number): string {
  return Math.abs(value) >= 10_000
    ? compactFormat.format(value)
    : formatNumber(value);
}

export function formatSigned(value: number): string {
  const formatted = formatNumber(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function formatPercent(value: number): string {
  return `${oneDecimalFormat.format(value)}%`;
}

/** `2026-09-14` → `Sept. 14`, the way a chart axis wants it. */
export function formatDayLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatFullDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Compact span for a note line: `Jul 4 – Sep 14, 2026`. */
export function formatDayRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }

  const short: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const startLabel = start.toLocaleDateString("en-US", short);
  const endLabel = end.toLocaleDateString("en-US", {
    ...short,
    year: "numeric",
  });

  return start.getUTCFullYear() === end.getUTCFullYear()
    ? `${startLabel} – ${endLabel}`
    : `${start.toLocaleDateString("en-US", { ...short, year: "numeric" })} – ${endLabel}`;
}

export function formatMonthLabel(period: string): string {
  const parsed = new Date(`${period.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return period;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** UTC calendar day for an instant, as `YYYY-MM-DD`. */
export function toDayKey(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}
