/**
 * Renders a synchronous inline <script> (e.g. for pre-hydration theme/flash
 * fixes) without React's dev-mode "Encountered a script tag while
 * rendering" warning: `text/javascript` on the server so the browser still
 * executes it during HTML parsing, `text/plain` on the client so React
 * doesn't treat it as an executable script tag it owns. See
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
