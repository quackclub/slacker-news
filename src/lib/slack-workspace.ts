// Workspace-wide Slack analytics, as published by slack-data.hackclub.dev.
// `membership` is a set of current headline figures; `stats` is a short daily
// window (about four weeks) of the analytics export.

const STATS_URL = "https://slack-data.hackclub.dev/full";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

export type WorkspaceDay = {
  date: string;
  fullMembers?: number;
  guests?: number;
  totalMembers?: number;
  claimedMembers?: number;
  activeUsers1d?: number;
  activeUsers7d?: number;
  activeUsers28d?: number;
  writers1d?: number;
  readers1d?: number;
  messages1d?: number;
  channelMessages1d?: number;
  dmMessages1d?: number;
  groupMessages1d?: number;
  appMessages1d?: number;
  files1d?: number;
  channels?: number;
};

export type WorkspaceFigure = {
  key: string;
  label: string;
  value: number;
  change?: number;
  changePercentage?: number;
};

export type WorkspaceDataset = {
  days: WorkspaceDay[];
  figures: WorkspaceFigure[];
  rangeStart?: string;
  rangeEnd?: string;
  computedAt?: number;
  fetchedAt: number;
};

type RawRow = Record<string, unknown>;

function num(row: RawRow, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toDay(row: RawRow): WorkspaceDay | undefined {
  const date = typeof row.ds === "string" ? row.ds : undefined;
  if (!date) return undefined;

  return {
    date,
    fullMembers: num(row, "full_members_count"),
    guests: num(row, "guests_count"),
    totalMembers: num(row, "total_members_count"),
    claimedMembers: num(row, "total_claimed_count"),
    activeUsers1d: num(row, "active_users_1d"),
    activeUsers7d: num(row, "active_users_7d"),
    activeUsers28d: num(row, "active_users_28d"),
    writers1d: num(row, "writers_count_1d"),
    readers1d: num(row, "readers_count_1d"),
    messages1d: num(row, "messages_count_1d"),
    channelMessages1d: num(row, "chats_channels_count_1d"),
    dmMessages1d: num(row, "chats_dms_count_1d"),
    groupMessages1d: num(row, "chats_groups_count_1d"),
    appMessages1d: num(row, "messages_channels_count_from_apps_1d"),
    files1d: num(row, "files_count_1d"),
    channels: num(row, "channels_count"),
  };
}

type MembershipFigure = {
  number?: number;
  change?: number;
  change_in_percentage?: number;
};

function toFigure(
  key: string,
  label: string,
  figure: MembershipFigure | undefined,
): WorkspaceFigure | undefined {
  if (!figure || typeof figure.number !== "number") return undefined;
  return {
    key,
    label,
    value: figure.number,
    change: typeof figure.change === "number" ? figure.change : undefined,
    changePercentage:
      typeof figure.change_in_percentage === "number"
        ? figure.change_in_percentage
        : undefined,
  };
}

let cache: { value: WorkspaceDataset; expiresAt: number } | undefined;
let inFlight: Promise<WorkspaceDataset> | undefined;

async function load(): Promise<WorkspaceDataset> {
  const response = await fetch(STATS_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`slack-data responded ${response.status}`);

  const payload = (await response.json()) as {
    available_date_range?: { start_date?: string; end_date?: string };
    computed_ts?: number;
    membership?: Record<string, MembershipFigure>;
    stats?: RawRow[];
  };

  const days = (payload.stats ?? [])
    .map(toDay)
    .filter((day): day is WorkspaceDay => Boolean(day))
    .sort((a, b) => a.date.localeCompare(b.date));

  const membership = payload.membership ?? {};
  const figures = [
    toFigure("total_members", "Members", membership.total_members),
    toFigure(
      "total_claimed_members",
      "Claimed accounts",
      membership.total_claimed_members,
    ),
    toFigure(
      "monthly_active_users",
      "Monthly active",
      membership.monthly_active_users,
    ),
  ].filter((figure): figure is WorkspaceFigure => Boolean(figure));

  return {
    days,
    figures,
    rangeStart: payload.available_date_range?.start_date,
    rangeEnd: payload.available_date_range?.end_date,
    computedAt:
      typeof payload.computed_ts === "number"
        ? payload.computed_ts * 1000
        : undefined,
    fetchedAt: Date.now(),
  };
}

export async function getWorkspaceDataset(): Promise<WorkspaceDataset> {
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
