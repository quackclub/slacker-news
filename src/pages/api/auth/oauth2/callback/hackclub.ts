import type { APIRoute } from "astro";

export const GET: APIRoute = ({ url }) => {
  const destination = new URL("https://news.hackclub.com/api/auth/oauth2/callback/hackclub");

  for (const [key, value] of url.searchParams) {
    destination.searchParams.append(key, value);
  }

  return Response.redirect(destination, 302);
};
