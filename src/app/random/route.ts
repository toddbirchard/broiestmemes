import { redirect } from "next/navigation";
import { getAllRefs } from "@/lib/catalog";

/** Picked server-side and redirected, so it works without JS and is linkable. */
export const dynamic = "force-dynamic";

export async function GET() {
  const refs = await getAllRefs();
  const pick = refs[Math.floor(Math.random() * refs.length)];
  redirect(pick ? `/${pick.c}/${pick.s}` : "/");
}
