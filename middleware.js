// Vercel Routing Middleware. A shared pack link (/?pack=<id>) is served by
// api/pack-page.js, which puts that pack's title, description and picture in
// the page, so X and WhatsApp previews show the pack. Everything else carries
// on to the static site as usual. (Static files are matched before rewrites in
// vercel.json, so a rewrite there can't do this for "/".)
import { next, rewrite } from '@vercel/functions'

export const config = { matcher: '/' }

export default function middleware(request) {
  const url = new URL(request.url)
  if (!url.searchParams.has('pack')) return next()
  return rewrite(new URL(`/api/pack-page${url.search}`, url))
}
