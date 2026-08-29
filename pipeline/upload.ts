import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { BUCKET, DERIVATIVE_CACHE_CONTROL, MANIFEST_CACHE_CONTROL } from "./config.ts";
import type { RenderedFile } from "./derive.ts";

/**
 * Writes are the ONLY part of this project that needs credentials — the site and
 * the pipeline's own reads both go over anonymous public HTTPS. Keep that
 * asymmetry: never let a key requirement leak into the web app.
 */
function credentialPath(): string | undefined {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicit) return resolve(explicit);
  const local = resolve(process.cwd(), "gcloud.json");
  return existsSync(local) ? local : undefined;
}

let storage: Storage | undefined;
function bucket() {
  if (!storage) {
    const keyFilename = credentialPath();
    // Without a key file we fall back to Application Default Credentials, which
    // is how a local backfill runs under the operator's own gcloud login.
    storage = keyFilename ? new Storage({ keyFilename }) : new Storage();
  }
  return storage.bucket(BUCKET);
}

/**
 * Objects are public via the bucket-level `allUsers: objectViewer` binding, and
 * uniform bucket-level access is locked on, so there is no per-object ACL step
 * (and no way to do one even if we wanted).
 */
export async function uploadDerivative(file: RenderedFile): Promise<void> {
  await bucket()
    .file(file.path)
    .save(file.body, {
      contentType: file.contentType,
      // Safe forever: every derivative filename embeds a hash of its own content.
      metadata: { cacheControl: DERIVATIVE_CACHE_CONTROL },
      resumable: false,
    });
}

export async function uploadManifest(path: string, json: string): Promise<void> {
  await bucket()
    .file(path)
    .save(json, {
      contentType: "application/json",
      // Short TTL on purpose — see config.ts.
      metadata: { cacheControl: MANIFEST_CACHE_CONTROL },
      resumable: false,
    });
}

export async function deleteObject(path: string): Promise<void> {
  try {
    await bucket().file(path).delete();
  } catch (err) {
    // Already gone is success as far as pruning is concerned.
    const code = (err as { code?: number }).code;
    if (code !== 404) throw err;
  }
}

/** Fetch the previous manifest. Returns null on a first run. */
export async function fetchExistingManifest(url: string): Promise<unknown | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return res.json();
}
