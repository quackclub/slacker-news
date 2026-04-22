export type PostStatus = "draft" | "review" | "published" | "archived";

export type PostCategory = "news" | "opinion" | "essays";

export interface PostAuthor {
  id?: string;
  email?: string | null;
  name?: string | null;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  status: PostStatus;
  category: PostCategory;
  gated: boolean;
  body: unknown;
  author?: PostAuthor | string | null;
  reviewNotes?: string | null;
}
