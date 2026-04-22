import type { Post, PostCategory } from "@slacker-news/types";

export interface PayloadClientConfig {
  apiKey?: string;
  fetch?: typeof fetch;
  internalURL?: string;
  isServer?: boolean;
  publicURL?: string;
}

interface PayloadListResponse<T> {
  docs: T[];
  page: number;
  totalDocs: number;
  totalPages: number;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildURL(config: PayloadClientConfig): string {
  const candidate = config.isServer ? config.internalURL ?? config.publicURL : config.publicURL ?? config.internalURL;
  return trimTrailingSlash(candidate ?? "http://localhost:3000");
}

function toQuery(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export function getPostURL(post: Pick<Post, "category" | "slug">): string {
  return `/${post.category}/${post.slug}/`;
}

export function parsePostPath(pathOrSlug: string): { category: PostCategory; slug: string } | null {
  const cleaned = pathOrSlug.replace(/^\/+|\/+$/g, "");
  const [category, ...slugParts] = cleaned.split("/");

  if (!category || slugParts.length === 0) {
    return null;
  }

  if (category !== "news" && category !== "opinion" && category !== "essays") {
    return null;
  }

  return {
    category,
    slug: slugParts.join("/")
  };
}

export function createPayloadClient(config: PayloadClientConfig) {
  const fetchImpl = config.fetch ?? fetch;
  const payloadURL = buildURL(config);

  async function payloadFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");

    if (config.apiKey) {
      headers.set("Authorization", `users API-Key ${config.apiKey}`);
    }

    const response = await fetchImpl(`${payloadURL}/api${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`Payload API error: ${response.status} on ${path}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async getPublishedPosts(): Promise<Post[]> {
      const query = toQuery({
        "depth": "1",
        "limit": "100",
        "sort": "-date",
        "where[status][equals]": "published"
      });

      const data = await payloadFetch<PayloadListResponse<Post>>(`/posts?${query}`);
      return data.docs;
    },
    async getPostByPath(pathOrSlug: string): Promise<Post | null> {
      const parsed = parsePostPath(pathOrSlug);
      if (!parsed) {
        return null;
      }

      const query = toQuery({
        "depth": "1",
        "limit": "1",
        "where[and][0][category][equals]": parsed.category,
        "where[and][1][slug][equals]": parsed.slug,
        "where[and][2][status][equals]": "published"
      });

      const data = await payloadFetch<PayloadListResponse<Post>>(`/posts?${query}`);
      return data.docs[0] ?? null;
    },
    async verifySession(cookie: string): Promise<boolean> {
      if (!cookie) {
        return false;
      }

      try {
        const data = await payloadFetch<{ user?: { id: string } }>("/users/me", {
          headers: {
            Cookie: cookie
          }
        });

        return Boolean(data.user?.id);
      } catch {
        return false;
      }
    }
  };
}
