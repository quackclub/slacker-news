import type { Post as PayloadPost } from "@slacker-news/types";
import { getPostURL } from "@slacker-news/payload-client";
import { getEntry, type CollectionEntry } from "astro:content";
import { getPublishedPosts } from "./payload";
import siteData from "../data/site.json";
import frontpageData from "../data/frontpage.json";
import changelogData from "../data/changelog.json";
import acknowledgementsData from "../data/acknowledgements.json";

export type SiteConfig = {
    title: string;
    description: string;
};

export type Post = {
    slug: string;
    url: string;
    title: string;
    author?: string;
    category?: string;
    date: Date;
    excerpt: string;
    paragraphs: string[];
    leadingImage?: {
        src: string;
        alt: string;
    };
    body: unknown;
    gated: boolean;
};

export type ChangelogEntry = {
    change: string;
    date: string;
    author: string;
    slackId?: string;
};

export type Acknowledgement = {
    name: string;
    slackId?: string;
};

type FrontpageData = {
    headline?: string[];
};

function normalizeWhitespace(input: string): string {
    return input.replace(/\s+/g, " ").trim();
}

function truncateWords(input: string, count: number): string {
    const words = normalizeWhitespace(input).split(" ");
    if (words.length <= count) {
        return words.join(" ");
    }

    return `${words.slice(0, count).join(" ")}...`;
}

function replaceSlackMentionComponents(input: string): string {
    return input.replace(/<SlackMention\s+name="([^"]+)"\s+id="([^"]+)"\s*\/?>/g, (_match, name) => `@${name}`);
}

function replaceSlackChannelComponents(input: string): string {
    return input.replace(/<SlackChannel\s+id="([^"]+)"\s*\/?>/g, (_match, id) => `#${id}`);
}

function stripMarkdown(input: string): string {
    return normalizeWhitespace(
        replaceSlackChannelComponents(replaceSlackMentionComponents(input))
            .replace(/^import\s.+$/gm, "")
            .replace(/^export\s.+$/gm, "")
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
            .replace(/<[^>]+>/g, " ")
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function extractTextFromLexicalNode(node: unknown): string {
    if (!isRecord(node)) {
        return "";
    }

    const text = typeof node.text === "string" ? node.text : "";
    const children = Array.isArray(node.children) ? node.children : [];
    const childText = children.map((child) => extractTextFromLexicalNode(child)).join(" ");
    const combined = normalizeWhitespace(`${text} ${childText}`);

    if (node.type === "linebreak") {
        return "\n";
    }

    return combined;
}

function extractTextBlocks(body: unknown): string[] {
    if (!isRecord(body) || !isRecord(body.root) || !Array.isArray(body.root.children)) {
        return [];
    }

    return body.root.children
        .map((node) => normalizeWhitespace(extractTextFromLexicalNode(node)))
        .filter(Boolean);
}

function toExcerpt(post: PayloadPost): string {
    const source = post.excerpt ?? extractTextBlocks(post.body)[0] ?? "";
    return stripMarkdown(source);
}

function getAuthorName(author: PayloadPost["author"]): string | undefined {
    if (!author) {
        return undefined;
    }

    if (typeof author === "string") {
        return author;
    }

    return author.name ?? author.email ?? undefined;
}

export async function getSiteConfig(): Promise<SiteConfig> {
    return {
        title: siteData.title,
        description: siteData.description
    };
}

export async function getPosts(): Promise<Post[]> {
    const posts = await getPublishedPosts();

    return posts
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((entry) => {
            const paragraphs = extractTextBlocks(entry.body);

            return {
                slug: `${entry.category}/${entry.slug}`,
                url: getPostURL(entry),
                title: entry.title,
                author: getAuthorName(entry.author),
                category: entry.category,
                date: new Date(entry.date),
                excerpt: toExcerpt(entry),
                paragraphs: paragraphs.length > 0 ? paragraphs : [toExcerpt(entry)],
                leadingImage: undefined,
                body: entry.body,
                gated: entry.gated
            } satisfies Post;
        });
}

export async function getFrontpageData(): Promise<FrontpageData> {
    return frontpageData;
}

export async function getChangelogEntries(): Promise<ChangelogEntry[]> {
    return changelogData;
}

export async function getAcknowledgements(): Promise<Acknowledgement[]> {
    return acknowledgementsData;
}

export async function getRecentChangelogEntries(days: number): Promise<ChangelogEntry[]> {
    const nowTimestamp = Date.now();
    const threshold = nowTimestamp - days * 24 * 60 * 60 * 1000;

    return (await getChangelogEntries()).filter((entry) => new Date(`${entry.date}T00:00:00Z`).getTime() >= threshold);
}

export function formatStoryDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    }).format(date);
}

export async function getPageEntry(slug: string): Promise<CollectionEntry<"pages">> {
    const entry = await getEntry("pages", slug);
    if (!entry) {
        throw new Error(`Missing required content entry pages/${slug}`);
    }

    return entry;
}

export { truncateWords };
