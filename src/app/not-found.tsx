import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="meta-sm mb-3 text-amber">404</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-bone">
        No such object
      </h1>
      <p className="meta mt-3">That category or meme isn&rsquo;t in the bucket.</p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/"
          className="meta-sm rounded-[3px] border border-hairline px-3 py-2 text-dim transition-colors hover:border-hairline-lit hover:text-bone"
        >
          All categories
        </Link>
        <Link
          href="/random"
          prefetch={false}
          className="meta-sm rounded-[3px] border border-amber-dim px-3 py-2 text-amber transition-colors hover:bg-amber/10"
        >
          Surprise me →
        </Link>
      </div>
    </main>
  );
}
