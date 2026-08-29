"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Modal shell built on native <dialog>.
 *
 * showModal() gives focus trapping, Esc handling, inertness of the background,
 * and the top layer for free — all the things a hand-rolled modal gets wrong.
 * We only add: closing returns to the grid (router.back), and a backdrop click
 * counts as a close.
 */
export function Lightbox({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Esc fires `cancel`; intercept so we navigate rather than just hiding the
    // dialog, which would leave the URL pointing at the image page.
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [close]);

  return (
    <dialog
      ref={ref}
      // Backdrop click closes. The keyboard equivalent is Esc, which <dialog>
      // raises as `cancel` and the listener above turns into the same
      // router.back() — so no explicit key handler is needed here.
      onClick={(e) => {
        // Only a click on the dialog element itself is the backdrop; clicks on
        // children bubble up with a different target.
        if (e.target === ref.current) close();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-ink/95 p-0 backdrop:bg-transparent"
    >
      <div className="flex min-h-dvh flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 flex justify-end p-3">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="meta-sm rounded-[3px] border border-hairline bg-ink px-2.5 py-1.5 text-dim transition-colors hover:border-hairline-lit hover:text-bone"
          >
            Esc ✕
          </button>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </dialog>
  );
}
