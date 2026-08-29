import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImagePager } from "@/components/image/ImagePager";
import { MemeStage } from "@/components/image/MemeStage";
import { MetaPanel } from "@/components/image/MetaPanel";
import { assetUrl } from "@/lib/assets";
import { getEntry, getNeighbours } from "@/lib/catalog";

/**
 * Not prerendered. ~1,900 image pages would bloat the build for pages that are
 * mostly reached one at a time, and `dynamicParams` (on by default) means a
 * brand-new meme renders on first request without a deploy.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; image: string }>;
}): Promise<Metadata> {
  const { category, image } = await params;
  const entry = await getEntry(category, image);
  if (!entry) return { title: "Not found" };

  const og = assetUrl(entry.derived.og.path);

  return {
    title: entry.title,
    description: `${entry.title} — from the ${entry.category} collection.`,
    alternates: { canonical: `/${entry.category}/${entry.slug}` },
    openGraph: {
      type: "article",
      title: entry.title,
      description: `From ${entry.category}/ · Broiest Memes`,
      url: `/${entry.category}/${entry.slug}`,
      // Always the `og` derivative, never the source: a 54MB GIF will not
      // unfurl anywhere, and width/height are what make Slack render a large
      // card instead of a thumbnail.
      images: [{ url: og, width: 1200, height: 630, alt: entry.title }],
      ...(entry.derived.video
        ? {
            videos: [
              {
                url: assetUrl(entry.derived.video.path),
                type: "video/mp4",
                width: entry.derived.video.w,
                height: entry.derived.video.h,
              },
            ],
          }
        : {}),
    },
    twitter: { card: "summary_large_image", title: entry.title, images: [og] },
  };
}

export default async function ImagePage({
  params,
}: {
  params: Promise<{ category: string; image: string }>;
}) {
  const { category, image } = await params;
  const entry = await getEntry(category, image);
  if (!entry) notFound();

  const { prev, next, index, total } = await getNeighbours(entry);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <nav className="meta-sm mb-4 flex items-center gap-1.5">
        <Link href="/" className="text-amber transition-colors hover:text-bone">
          gs://broiestbot
        </Link>
        <span className="text-faint">/</span>
        <Link href={`/${entry.category}`} className="text-dim transition-colors hover:text-bone">
          {entry.category}
        </Link>
        <span className="text-faint">/</span>
        <span className="truncate text-dim">{entry.slug}</span>
      </nav>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="flex w-full justify-center rounded-sm bg-ink-sunken p-2 sm:p-4">
            <MemeStage entry={entry} />
          </div>
          <div className="w-full">
            <ImagePager prev={prev} next={next} index={index} total={total} />
          </div>
        </div>

        <MetaPanel entry={entry} />
      </div>
    </main>
  );
}
