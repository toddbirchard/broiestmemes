import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/category/Gallery";
import { assetUrl } from "@/lib/assets";
import { getCategory, getCategoryNeighbours, getHome } from "@/lib/catalog";
import { formatBytes, formatCount, formatSpan } from "@/lib/format";

/** All 112 categories are prerendered; there are few enough that it's ~free. */
export async function generateStaticParams() {
  const index = await getHome();
  return index.categories.map((c) => ({ category: c.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const found = await getCategory(category);
  if (!found) return { title: "Not found" };

  const { summary, items } = found;
  const cover = items.find((i) => i.id === summary.coverIds[0]) ?? items[0];
  const description = `${formatCount(summary.count)} memes in ${summary.title}, ${formatSpan(summary.oldestAt, summary.newestAt)}.`;

  return {
    title: summary.title,
    description,
    alternates: { canonical: `/${summary.name}` },
    openGraph: {
      type: "website",
      title: `${summary.title} · Broiest Memes`,
      description,
      url: `/${summary.name}`,
      images: cover
        ? [{ url: assetUrl(cover.derived.og.path), width: 1200, height: 630, alt: summary.title }]
        : undefined,
    },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const found = await getCategory(category);
  if (!found) notFound();

  const { summary, items } = found;
  const { prev, next } = await getCategoryNeighbours(category);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <nav className="meta-sm mb-2 flex items-center gap-1.5">
          <Link href="/" className="text-amber transition-colors hover:text-bone">
            gs://broiestbot
          </Link>
          <span className="text-faint">/</span>
          <span className="text-dim">{summary.name}/</span>
        </nav>

        <h1 className="font-display text-3xl font-extrabold leading-[0.95] tracking-[-0.03em] text-bone sm:text-4xl">
          {summary.title}
        </h1>

        <p className="meta mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-bone/70">{formatCount(summary.count)} memes</span>
          {summary.animatedCount > 0 ? (
            <>
              <span className="text-faint">·</span>
              <span>{formatCount(summary.animatedCount)} animated</span>
            </>
          ) : null}
          <span className="text-faint">·</span>
          <span>{formatBytes(summary.bytes)}</span>
          <span className="text-faint">·</span>
          <span>{formatSpan(summary.oldestAt, summary.newestAt)}</span>
        </p>
      </header>

      <Gallery items={items} />

      <nav className="mt-12 flex items-center justify-between gap-4 border-t border-hairline pt-5">
        {prev ? (
          <Link
            href={`/${prev.name}`}
            className="meta group min-w-0 flex-1 transition-colors hover:text-bone"
          >
            <span className="meta-sm block">← previous</span>
            <span className="block truncate text-bone/80 group-hover:text-signal">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}

        <Link
          href="/"
          className="meta-sm shrink-0 rounded-[3px] border border-hairline px-3 py-2 text-dim transition-colors hover:border-hairline-lit hover:text-bone"
        >
          All categories
        </Link>

        {next ? (
          <Link
            href={`/${next.name}`}
            className="meta group min-w-0 flex-1 text-right transition-colors hover:text-bone"
          >
            <span className="meta-sm block">next →</span>
            <span className="block truncate text-bone/80 group-hover:text-signal">
              {next.title}
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </main>
  );
}
