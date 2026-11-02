/** What a window's page shows: a document, or the welcome page the app shows while no document is open. */
export type Page = "document" | "welcome";

/** The page a window's URL routes to; the welcome window opens /?page=welcome (welcome.go). */
export function pageOf(search: string): Page {
  return new URLSearchParams(search).get("page") === "welcome" ? "welcome" : "document";
}
