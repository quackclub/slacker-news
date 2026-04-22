import { defineMiddleware } from "astro:middleware";
import { verifySession } from "./lib/payload";

const GATED_PREFIXES = ["/members", "/reports"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isGatedRoute = GATED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isGatedRoute) {
    return next();
  }

  const cookie = context.request.headers.get("cookie") ?? "";
  const authenticated = await verifySession(cookie);

  if (authenticated) {
    return next();
  }

  const loginURL = new URL(`${import.meta.env.PUBLIC_PAYLOAD_URL}/admin/login`);
  loginURL.searchParams.set("redirect", context.url.href);
  return context.redirect(loginURL.toString());
});
