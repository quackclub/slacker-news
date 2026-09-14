import { getAllIndigestMessages, type IndigestMessage } from "./indigest";
import { getSlackChannelNames } from "./slack-channels";
import { getSlackUserDisplayName } from "./slack-users";

// #prometheus-public — the Hack Club Slack's public deletion log. Every line is
// written by the Prometheus bot in one of a handful of fixed shapes; anything
// else in the channel is a human aside and is counted as unparsed, never as an
// event.
export const PROMETHEUS_CHANNEL_ID = "C0ANGHXK0KH";
export const PROMETHEUS_CHANNEL_NAME = "prometheus-public";

export type DeletionKind = "message" | "thread";

export type DeletionEvent = {
  /** Slack timestamp of the log line, used as the event's stable id. */
  id: string;
  /** When the deletion was logged, epoch milliseconds. */
  at: number;
  kind: DeletionKind;
  /**
   * Messages removed. A message deletion removes one; a thread deletion removes
   * however many the log line names, and 1 when it names none.
   */
  removed: number;
  /** Thread length, only when the log line reports it. */
  threadSize?: number;
  /** Channel the deletion happened in, when the line names one. */
  channelId?: string;
  /** Moderator credited with the deletion, when the line names one. */
  actorId?: string;
};

export type PrometheusDataset = {
  events: DeletionEvent[];
  channelNames: Record<string, string>;
  actorNames: Record<string, string>;
  /** Log lines that matched no known shape — human asides, mostly. */
  unparsed: number;
  /** Lines parsed as events but with no moderator credited. */
  unattributed: number;
  totalLines: number;
  firstAt?: number;
  lastAt?: number;
  fetchedAt: number;
};

const CHANNEL_PATTERN = /<#(C[A-Z0-9]+)(?:\|[^>]*)?>|#(C[A-Z0-9]+)\b/;
const ACTOR_PATTERN = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/;
const THREAD_SIZE_PATTERN = /with\s+(\d+)\s+messages?/i;

function messageDate(message: IndigestMessage): number {
  const parsed = Date.parse(message.timestamp);
  if (Number.isFinite(parsed)) return parsed;

  const slackTs = Number(message.slackTs);
  return Number.isFinite(slackTs) ? slackTs * 1000 : Number.NaN;
}

export function parseDeletionEvent(
  message: IndigestMessage,
): DeletionEvent | undefined {
  const text = message.text ?? "";
  // Both shapes of thread line ("deleted a thread with 4 messages", "Thread
  // deleted in …") contain the word "messages", so thread has to be tested
  // first or every thread would be counted as a single message.
  const isThread = /\bthread\b/i.test(text);
  const isMessage = /\bmessages?\b/i.test(text);
  if (!isThread && !isMessage) return undefined;
  if (!/\b(deleted|rm -rf)\b/i.test(text)) return undefined;

  const at = messageDate(message);
  if (!Number.isFinite(at)) return undefined;

  const channelMatch = text.match(CHANNEL_PATTERN);
  const actorMatch = text.match(ACTOR_PATTERN);
  const sizeMatch = isThread ? text.match(THREAD_SIZE_PATTERN) : null;
  const threadSize = sizeMatch ? Number(sizeMatch[1]) : undefined;

  return {
    id: message.slackTs,
    at,
    kind: isThread ? "thread" : "message",
    removed: isThread ? Math.max(threadSize ?? 1, 1) : 1,
    ...(threadSize !== undefined ? { threadSize } : {}),
    ...(channelMatch ? { channelId: channelMatch[1] ?? channelMatch[2] } : {}),
    ...(actorMatch ? { actorId: actorMatch[1] } : {}),
  };
}

async function resolveActorNames(
  ids: Iterable<string>,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const names = await Promise.all(unique.map(getSlackUserDisplayName));

  const resolved: Record<string, string> = {};
  unique.forEach((id, index) => {
    const name = names[index];
    if (name) resolved[id] = name;
  });
  return resolved;
}

export async function getPrometheusDataset(): Promise<PrometheusDataset> {
  const messages = await getAllIndigestMessages(PROMETHEUS_CHANNEL_ID);

  const events: DeletionEvent[] = [];
  let unparsed = 0;

  for (const message of messages) {
    const event = parseDeletionEvent(message);
    if (event) events.push(event);
    else unparsed++;
  }

  events.sort((a, b) => a.at - b.at);

  const [channelNames, actorNames] = await Promise.all([
    getSlackChannelNames(
      events
        .map((event) => event.channelId)
        .filter((id): id is string => Boolean(id)),
    ),
    resolveActorNames(
      events
        .map((event) => event.actorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]);

  return {
    events,
    channelNames,
    actorNames,
    unparsed,
    unattributed: events.filter((event) => !event.actorId).length,
    totalLines: messages.length,
    firstAt: events[0]?.at,
    lastAt: events[events.length - 1]?.at,
    fetchedAt: Date.now(),
  };
}
