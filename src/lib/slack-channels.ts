// Server-side twin of the channel-name hydration BaseLayout runs in the browser:
// dashboards need the names while they are still aggregating, not after paint.

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

type ChannelEntry = {
  name: string | undefined;
  expiresAt: number;
};

const channelCache = new Map<string, ChannelEntry>();
const inFlight = new Map<string, Promise<string | undefined>>();

async function loadChannelName(id: string): Promise<string | undefined> {
  try {
    const response = await fetch(
      `https://flaron.halceon.dev/channel/${encodeURIComponent(id)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) return undefined;

    const payload = (await response.json()) as { name?: unknown };
    return typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function getSlackChannelName(id: string): Promise<string | undefined> {
  if (!/^C[A-Z0-9]+$/i.test(id)) return Promise.resolve(undefined);

  const cached = channelCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.name);
  }

  const pending = inFlight.get(id);
  if (pending) return pending;

  const request = loadChannelName(id)
    .then((name) => {
      // Cache misses too, briefly, so one dead id can't re-request on every
      // render — but for much less time than a real answer.
      channelCache.set(id, {
        name,
        expiresAt: Date.now() + (name ? CACHE_TTL_MS : 60_000),
      });
      return name;
    })
    .finally(() => {
      inFlight.delete(id);
    });

  inFlight.set(id, request);
  return request;
}

export async function getSlackChannelNames(
  ids: Iterable<string>,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const names = await Promise.all(unique.map(getSlackChannelName));

  const resolved: Record<string, string> = {};
  unique.forEach((id, index) => {
    const name = names[index];
    if (name) resolved[id] = name;
  });
  return resolved;
}
