import type { CustomCardEntry } from './types/ha'

export const VERSION = __CW_VERSION__

declare global {
  interface Window {
    customCards?: CustomCardEntry[]
  }
}

const REPO_URL = 'https://github.com/64bitjoe/cupertino-widgets'

/**
 * Define one custom element, tolerating a bundle that has already been loaded once.
 *
 * We define elements here rather than with Lit's `@customElement`, because a
 * duplicate `customElements.define` throws and kills the whole bundle, and a
 * duplicate load is easy to hit in the wild (HACS resource plus a leftover manual
 * one, or an old cached copy). Skipping is the friendlier failure.
 *
 * Returns whether this call is the one that defined the tag, so a caller with more to
 * register (a card, which also wants a card-picker entry) can skip that too.
 */
export function defineElement(tag: string, ctor: CustomElementConstructor): boolean {
  if (customElements.get(tag)) {
    console.warn(
      `[cupertino-widgets] <${tag}> is already defined, skipping. ` +
        'The bundle is probably loaded twice; check your dashboard resources.',
    )
    return false
  }

  customElements.define(tag, ctor)
  return true
}

/**
 * Register one card with both the custom-element registry and the dashboard card
 * picker.
 */
export function registerCard(
  tag: string,
  ctor: CustomElementConstructor,
  entry: Omit<CustomCardEntry, 'type'>,
): void {
  if (!defineElement(tag, ctor)) return

  const cards = (window.customCards ??= [])
  cards.push({
    type: tag,
    // `preview: true` makes the picker render a live card instead of a grey tile.
    preview: true,
    documentationURL: REPO_URL,
    ...entry,
  })
}

let bannerShown = false

export function printBanner(): void {
  if (bannerShown) return
  bannerShown = true
  console.info(
    `%c Cupertino Widgets %c ${VERSION} `,
    'background:#0a84ff;color:#fff;border-radius:3px 0 0 3px;padding:1px 6px;font-weight:600',
    'background:#3a3a3c;color:#fff;border-radius:0 3px 3px 0;padding:1px 6px',
  )
}
