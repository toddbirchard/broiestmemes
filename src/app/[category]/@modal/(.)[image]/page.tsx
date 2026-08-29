import { notFound } from "next/navigation";
import { ImagePager } from "@/components/image/ImagePager";
import { MemeStage } from "@/components/image/MemeStage";
import { MetaPanel } from "@/components/image/MetaPanel";
import { Lightbox } from "@/components/ui/Lightbox";
import { getEntry, getNeighbours } from "@/lib/catalog";

/**
 * Intercepted route: arriving at /[category]/[image] from the grid renders this
 * modal over the gallery, with the real URL in the address bar. A direct visit,
 * a refresh, or a shared link renders the standalone page instead.
 *
 * This is the whole reason the project is on Next — it's routing config rather
 * than a hand-rolled client router with a history stack to get wrong.
 */
export default async function InterceptedImagePage({
  params,
}: {
  params: Promise<{ category: string; image: string }>;
}) {
  const { category, image } = await params;
  const entry = await getEntry(category, image);
  if (!entry) notFound();

  const { prev, next, index, total } = await getNeighbours(entry);

  return (
    <Lightbox>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pb-8 sm:px-6 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="flex w-full justify-center">
            <MemeStage entry={entry} />
          </div>
          <div className="w-full">
            <ImagePager prev={prev} next={next} index={index} total={total} />
          </div>
        </div>
        <MetaPanel entry={entry} />
      </div>
    </Lightbox>
  );
}
