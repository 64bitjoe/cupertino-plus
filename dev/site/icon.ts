import { html, type TemplateResult } from 'lit'

/**
 * One MDI glyph, inline.
 *
 * The same icon set Home Assistant draws the rest of a dashboard from, so the site's
 * furniture belongs to the software it is about. A bare path string out of `@mdi/js`
 * tree-shakes down to that one string, which is why the package can be a dependency
 * without the bundle noticing.
 */
export const icon = (path: string): TemplateResult =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path} /></svg>`
