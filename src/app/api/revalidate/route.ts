import { revalidateTag } from "next/cache";

/**
 * Closes the no-deploy loop: the pipeline POSTs here after any run that changed
 * something, dropping the cached manifest immediately rather than waiting out
 * the 300s ISR window.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return Response.json({ error: "REVALIDATE_SECRET is not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Next 16 requires a cacheLife profile. `{ expire: 0 }` purges immediately,
  // which is the point — the pipeline only calls this when content changed.
  revalidateTag("manifest", { expire: 0 });
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
