/**
 * Which widget the page is showing, kept in the URL fragment.
 *
 * A fragment rather than a path, because the site is served as static files from a
 * subdirectory on GitHub Pages: there is no server to rewrite `/calendar` back onto
 * `index.html`, so a real path would 404 the moment anyone reloaded or shared a link.
 * `#/calendar` costs nothing and survives both.
 */

import { WIDGETS, widgetById, type Widget } from './catalog'

export const hrefFor = (widget: Widget): string => `#/${widget.id}`

const idFromHash = (): string => location.hash.replace(/^#\/?/, '').split('/')[0] ?? ''

/**
 * The widget the URL is asking for.
 *
 * An unknown id falls back to the first widget rather than showing an error, and the
 * URL is corrected on the way: a stale link from an older build should land somewhere
 * sensible, not on a page explaining that it did not.
 */
export function startRouter(onRoute: (widget: Widget) => void): void {
  const resolve = (): void => {
    const wanted = idFromHash()
    const widget = widgetById(wanted) ?? (WIDGETS[0] as Widget)
    if (wanted !== widget.id) {
      // `replaceState`, not a new entry: a corrected URL is not a place the visitor
      // should have to press Back through.
      history.replaceState(null, '', hrefFor(widget))
    }
    onRoute(widget)
  }

  addEventListener('hashchange', resolve)
  resolve()
}
