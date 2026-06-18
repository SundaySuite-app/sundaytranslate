/** A small, consistent styled inline error used across the consoles.
 *  Renders as a polite-but-assertive live region so screen readers announce
 *  it the moment it appears, replacing bare <p> error tags / alert(). */
export function InlineError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="alert" role="alert">
      {children}
    </p>
  );
}
