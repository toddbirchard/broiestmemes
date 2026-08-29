import { isSourceObject } from "../src/types/manifest.ts";
import { API_BASE, PUBLIC_BASE } from "./config.ts";

export interface ListedObject {
  name: string;
  size: number;
  contentType: string;
  /** Changes on every overwrite. This is the incrementality token. */
  generation: string;
  md5Hash: string;
  timeCreated: string;
  updated: string;
}

/**
 * `md5Hash` is absent on composite uploads, and `contentType` is missing on a
 * few objects, so both are tolerated as empty rather than failing the run.
 */
interface RawItem {
  name: string;
  size?: string;
  contentType?: string;
  generation?: string;
  md5Hash?: string;
  timeCreated?: string;
  updated?: string;
}

/**
 * Full bucket inventory, fetched anonymously. The bucket grants
 * roles/storage.objectViewer to allUsers, which includes list permission — so
 * this needs no credentials. Measured at ~0.9s for 2,016 objects over 3 pages.
 */
export async function listBucket(): Promise<ListedObject[]> {
  const fields =
    "nextPageToken,items(name,size,contentType,generation,md5Hash,timeCreated,updated)";
  const out: ListedObject[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${API_BASE}/o`);
    url.searchParams.set("maxResults", "1000");
    url.searchParams.set("fields", fields);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`bucket listing failed: ${res.status} ${res.statusText}`);
    }
    const page = (await res.json()) as { items?: RawItem[]; nextPageToken?: string };

    for (const item of page.items ?? []) {
      out.push({
        name: item.name,
        size: Number(item.size ?? 0),
        contentType: item.contentType ?? "application/octet-stream",
        generation: item.generation ?? "0",
        md5Hash: item.md5Hash ?? "",
        timeCreated: item.timeCreated ?? item.updated ?? new Date(0).toISOString(),
        updated: item.updated ?? item.timeCreated ?? new Date(0).toISOString(),
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Source memes only: drops the 114 zero-byte directory placeholders and
 * everything the pipeline itself wrote under `_derived/`.
 */
export function sourceObjects(all: ListedObject[]): ListedObject[] {
  return all.filter((o) => isSourceObject(o.name));
}

/** Download an original over anonymous public HTTPS. */
export async function fetchObject(name: string): Promise<Buffer> {
  const url = `${PUBLIC_BASE}/${name.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${name} failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

export function splitName(name: string): { category: string; filename: string } {
  const idx = name.indexOf("/");
  return { category: name.slice(0, idx), filename: name.slice(idx + 1) };
}
