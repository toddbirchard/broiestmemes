import { assetUrl } from "@/lib/assets";
import { getAllRefs } from "@/lib/catalog";

/**
 * Same-origin download proxy.
 *
 * This route is not a convenience — it is required. The bucket has no CORS
 * configuration, so a client-side fetch-then-blob download fails outright, and
 * a cross-origin `<a download>` is ignored by browsers (they navigate to the
 * file instead of saving it). Streaming through our own origin is the only way
 * a download button actually downloads.
 *
 * The requested path is validated against the manifest before proxying, so this
 * cannot be used as an open proxy for arbitrary URLs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectName = path.map(decodeURIComponent).join("/");

  const refs = await getAllRefs();
  if (!refs.some((r) => r.n === objectName)) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetch(assetUrl(objectName));
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  const filename = objectName.split("/").pop() ?? "meme";

  // Stream rather than buffer: the largest object here is 54MB and must not be
  // held in the server's memory to serve one download.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Length": upstream.headers.get("content-length") ?? "",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
