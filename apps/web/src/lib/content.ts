import { getEntry, type CollectionEntry } from "astro:content";
import siteData from "../data/site.json";
import changelogData from "../data/changelog.json";
import acknowledgementsData from "../data/acknowledgements.json";
import { fetchPosts, fetchChangelogs, type CmsPost, type CmsChangelog } from "./cms";

export type SiteConfig = {
    title: string;
    description: string;
    headlineOverride: string | null;
};

export type PostReference = {
    slug: string;
    url: string;
    title: string;
};

export type Post = {
    slug: string;
    url: string;
    title: string;
    author?: string | string[];
    authorSlackIds?: string[];
    category?: string;
    date: Date;
    excerpt: string;
    paragraphs: string[];
    readingTime: number;
    leadingImage?: {
        src: string;
        alt: string;
    };
    contentHtml: string;
    loginRequired: boolean;
    responseTo?: string[];
    followUpTo?: string[];
    responses?: PostReference[];
    followUps?: PostReference[];
};

type ChangelogBase = {
    date: string;
    author: string | string[];
    slackIds?: string[];
};

export type ShortChangelogEntry = ChangelogBase & {
    kind: "short";
    change: string;
};

export type LongChangelogEntry = ChangelogBase & {
    kind: "long";
    slug: string;
    url: string;
    title: string;
    excerpt: string;
    paragraphs: string[];
    leadingImage?: {
        src: string;
        alt: string;
    };
    contentHtml: string;
    responseTo?: PostReference[];
    followUpTo?: PostReference[];
};

export type ChangelogEntry = ShortChangelogEntry | LongChangelogEntry;

export type Acknowledgement = {
    name: string;
    slackId?: string;
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

function normalizeHandle(handle: string): string {
    return handle.trim().replace(/^@+/, "").toLowerCase();
}

function getAuthorSlackId(author: string | undefined): string | undefined {
    if (!author) {
        return undefined;
    }

    const normalizedAuthor = normalizeHandle(author);
    const matchingAcknowledgement = acknowledgementsData.find(
        (person) => normalizeHandle(person.name) === normalizedAuthor
    );

    return matchingAcknowledgement?.slackId;
}

function getAuthorSlackIds(authors: string | string[] | undefined): string[] {
    if (!authors) {
        return [];
    }

    const authorArray = Array.isArray(authors) ? authors : [authors];
    
    return authorArray
        .map((author) => getAuthorSlackId(author))
        .filter((id): id is string => Boolean(id));
}

function stripHtml(input: string): string {
    return normalizeWhitespace(input.replace(/<[^>]+>/g, " "));
}

function extractParagraphsFromHtml(html: string): string[] {
    const paragraphs: string[] = [];
    const blockTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "pre"];
    for (const tag of blockTags) {
        const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\/${tag}>`, "gi");
        let match;
        while ((match = regex.exec(html)) !== null) {
            const text = stripHtml(match[1]);
            if (text) paragraphs.push(text);
        }
    }
    return paragraphs;
}

function extractImageFromHtml(html: string): { src: string; alt: string } | undefined {
    const match = html.match(/<img\s[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/i);
    if (match) {
        return { src: match[1], alt: match[2] };
    }
    const simpleMatch = html.match(/<img\s[^>]*src=["']([^"']+)["']/i);
    if (simpleMatch) {
        return { src: simpleMatch[1], alt: "" };
    }
    return undefined;
}

function cmsPostToPost(cmsPost: CmsPost): Post {
    const paragraphs = extractParagraphsFromHtml(cmsPost.contentHtml);
    const leadingImage = cmsPost.heroImage?.url
        ? { src: cmsPost.heroImage.url, alt: cmsPost.heroImage.alt }
        : extractImageFromHtml(cmsPost.contentHtml);

    const wordCount = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);
    const category = cmsPost.categories[0]?.toLowerCase() || undefined;

    return {
        slug: cmsPost.slug,
        url: `/${cmsPost.slug}/`,
        title: cmsPost.title,
        author: cmsPost.authors.length > 0 ? (cmsPost.authors.length === 1 ? cmsPost.authors[0] : cmsPost.authors) : undefined,
        authorSlackIds: getAuthorSlackIds(cmsPost.authors),
        category,
        date: cmsPost.publishedAt ? new Date(cmsPost.publishedAt) : new Date(),
        excerpt: cmsPost.excerpt || stripHtml(paragraphs[0] || ""),
        paragraphs,
        readingTime: Math.max(1, Math.ceil(wordCount / 200)),
        leadingImage,
        contentHtml: cmsPost.contentHtml,
        loginRequired: cmsPost.loginRequired,
        responseTo: cmsPost.responseTo ? [cmsPost.responseTo] : undefined,
        followUpTo: cmsPost.followUpTo ? [cmsPost.followUpTo] : undefined,
    };
}

export async function getSiteConfig(): Promise<SiteConfig> {
    return {
        title: siteData.title,
        description: siteData.description,
        headlineOverride: siteData.headlineOverride ?? null
    };
}

export async function getPosts(options?: { draft?: boolean }): Promise<Post[]> {
    const cmsPosts = await fetchPosts(options);

    const processedPosts: Post[] = cmsPosts
        .map((cmsPost) => cmsPostToPost(cmsPost));

    const resolveSlugs = (raw: string | string[] | undefined): PostReference[] | undefined => {
        if (!raw) return undefined;
        const slugs = Array.isArray(raw) ? raw : [raw];
        const refs = slugs
            .map((slug) => processedPosts.find((p) => p.slug === slug))
            .filter((p): p is Post => Boolean(p))
            .map((p) => ({ slug: p.slug, url: p.url, title: p.title }));
        return refs.length ? refs : undefined;
    };

    for (const post of processedPosts) {
        post.responses = resolveSlugs(post.responseTo);
        post.followUps = resolveSlugs(post.followUpTo);
    }

    return processedPosts.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function getChangelogEntries(): Promise<ChangelogEntry[]> {
    const shortEntries: ShortChangelogEntry[] = changelogData.map((entry) => ({
        kind: "short",
        change: entry.change,
        date: entry.date,
        author: entry.author,
        slackIds: getAuthorSlackIds(entry.author)
    }));

    const cmsChangelogs = await fetchChangelogs();
    const posts = await getPosts();
    const resolveSlugs = (raw: string | string[] | undefined): PostReference[] | undefined => {
        if (!raw) return undefined;
        const slugs = Array.isArray(raw) ? raw : [raw];
        const refs = slugs
            .map((slug) => posts.find((p) => p.slug === slug))
            .filter((p): p is Post => Boolean(p))
            .map((p) => ({ slug: p.slug, url: p.url, title: p.title }));
        return refs.length ? refs : undefined;
    };
    const longEntries: LongChangelogEntry[] = cmsChangelogs.map((cl) => {
        const paragraphs = extractParagraphsFromHtml(cl.contentHtml);
        const leadingImage = extractImageFromHtml(cl.contentHtml);
        const dateString = cl.publishedAt ? cl.publishedAt.slice(0, 10) : '';
        const authorArr = Array.isArray(cl.authors) ? cl.authors : [cl.authors].filter(Boolean);
        const excerpt = cl.excerpt || stripHtml(paragraphs[0] || "");
        return {
            kind: "long",
            slug: cl.slug,
            url: `/changelogs/${cl.slug}/`,
            title: cl.title,
            date: dateString,
            author: authorArr.length === 1 ? authorArr[0] : authorArr,
            slackIds: getAuthorSlackIds(authorArr),
            excerpt,
            paragraphs,
            leadingImage,
            contentHtml: cl.contentHtml,
        };
    });

    return [...shortEntries, ...longEntries].sort(
        (a, b) => new Date(`${b.date}T00:00:00Z`).getTime() - new Date(`${a.date}T00:00:00Z`).getTime()
    );
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
