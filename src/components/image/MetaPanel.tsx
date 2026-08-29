"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { assetUrl, entryPath } from "@/lib/assets";
import { formatBytes, formatDate } from "@/lib/format";
import type { MemeEntry } from "@/types/manifest";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5">
      <dt className="meta-sm shrink-0">{label}</dt>
      <dd className="meta truncate text-right text-bone/80">{children}</dd>
    </div>
  );
}

/**
 * Everything true about this object, straight from the bucket, plus the four
 * actions that matter. Memes exist to be pasted elsewhere, so copy-link is the
 * primary action, not an afterthought.
 */
export function MetaPanel({ entry }: { entry: MemeEntry }) {
  const [copied, setCopied] = useState<"page" | "direct" | null>(null);

  const copy = useCallback(async (text: string, which: "page" | "direct") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the URL bar still works */
    }
  }, []);

  return (
    <div className="w-full lg:w-72 lg:shrink-0">
      <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-bone">
        {entry.title}
      </h1>

      <Link
        href={`/${entry.category}`}
        className="meta-sm mt-1.5 inline-block text-amber transition-colors hover:text-bone"
      >
        {entry.category}/
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => copy(`${window.location.origin}${entryPath(entry)}`, "page")}
          className="meta-sm rounded-[3px] border border-signal-dim bg-signal/10 px-2 py-2 text-signal transition-colors hover:bg-signal hover:text-ink"
        >
          {copied === "page" ? "Copied" : "Copy link"}
        </button>
        <a
          href={`/api/download/${entry.source.name}`}
          className="meta-sm rounded-[3px] border border-hairline px-2 py-2 text-center text-dim transition-colors hover:border-hairline-lit hover:text-bone"
        >
          Download
        </a>
        <button
          type="button"
          onClick={() => copy(assetUrl(entry.source.name), "direct")}
          className="meta-sm rounded-[3px] border border-hairline px-2 py-2 text-dim transition-colors hover:border-hairline-lit hover:text-bone"
        >
          {copied === "direct" ? "Copied" : "Copy image URL"}
        </button>
        <a
          href={assetUrl(entry.source.name)}
          target="_blank"
          rel="noreferrer"
          className="meta-sm rounded-[3px] border border-hairline px-2 py-2 text-center text-dim transition-colors hover:border-hairline-lit hover:text-bone"
        >
          Open original
        </a>
      </div>

      <dl className="mt-5">
        <Row label="added">
          <time dateTime={entry.source.timeCreated}>{formatDate(entry.source.timeCreated)}</time>
        </Row>
        {entry.kind !== "audio" ? (
          <Row label="dimensions">
            {entry.width}×{entry.height}
          </Row>
        ) : null}
        <Row label="size">{formatBytes(entry.source.size)}</Row>
        <Row label="format">{entry.format.toUpperCase()}</Row>
        {entry.frames ? <Row label="frames">{entry.frames}</Row> : null}
        <Row label="object">{entry.source.name}</Row>
      </dl>
    </div>
  );
}
