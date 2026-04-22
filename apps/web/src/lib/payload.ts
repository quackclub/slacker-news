import { createPayloadClient } from "@slacker-news/payload-client";

const client = createPayloadClient({
  apiKey: import.meta.env.PAYLOAD_API_KEY,
  internalURL: import.meta.env.PAYLOAD_INTERNAL_URL,
  isServer: import.meta.env.SSR,
  publicURL: import.meta.env.PUBLIC_PAYLOAD_URL
});

export const getPublishedPosts = client.getPublishedPosts;
export const getPostByPath = client.getPostByPath;
export const verifySession = client.verifySession;
