/**
 * Hosts the @modal parallel slot alongside the category page, so an intercepted
 * image route can render over the grid.
 */
export default function CategoryLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
