/**
 * The Colour dropdown every row and card editor draws, and the split between its two controls.
 *
 * One config key, `color`, drawn as two controls: a dropdown of the closed palette (plus "none"
 * and "type your own"), and a `color_custom` text box shown only when the dropdown reads
 * `COLOR_CUSTOM`. `splitColor` turns the key into the two on the way into a form, `foldColor`
 * turns them back on the way out. Here rather than in any one editor, because the chip, tile and
 * activity panels and the chips, tiles and live-activity card editors all draw the same pair:
 * one copy and another would drift the moment a tint was renamed.
 */

import { isTint, tintLabel, TINTS } from './tint'

/**
 * The sentinel the colour dropdown uses for "type a CSS colour instead". Never a config value:
 * `foldColor` folds it away into `color_custom` before a config is ever written.
 */
export const COLOR_CUSTOM = 'custom'

/**
 * The Colour dropdown: the closed palette, plus "none" and "type your own". `color_custom`, a
 * sibling text row shown only when this reads `COLOR_CUSTOM`, is where the literal lives.
 */
export const COLOR_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [
      { value: '', label: 'None — the row default' },
      ...TINTS.map(value => ({ value, label: tintLabel(value) })),
      { value: COLOR_CUSTOM, label: 'Custom…' },
    ],
  },
}

/**
 * The config's `color`, split into the dropdown and its custom box, in place on `data`.
 * Answers whether the custom box is still open, for the editor to remember.
 *
 * `customOpen` alone carries a row that has just been switched into custom mode but has nothing
 * typed into it yet — the config has no colour to show, so the value-based check cannot see it.
 * But a config that now names a real palette colour is never "type your own" mode, however it
 * got there: `setConfig` is called again for every later change, including one made in the YAML
 * tab that never goes through the editor's change handler at all. Left uncleared, a row switched
 * to `Custom…` and back to a plain `color: red` in YAML would still show "Custom…" with "red"
 * pre-filled into the text box — a valid palette name misrepresented as a custom one. So a
 * genuine tint always wins and clears the flag; only then does the flag get to speak for an
 * otherwise-empty colour.
 */
export const splitColor = (data: Record<string, unknown>, customOpen: boolean): boolean => {
  const configured = typeof data.color === 'string' ? data.color : ''
  if (configured && isTint(configured)) return false
  if (customOpen || configured) {
    data.color = COLOR_CUSTOM
    data.color_custom = configured
  }
  return customOpen
}

/**
 * The two controls folded back into the one `color` key, in place on `data`. Answers whether
 * the dropdown reads `COLOR_CUSTOM`: that report is the only moment an editor learns the row
 * wants the text box, and nothing about a still-empty `color_custom` belongs in the config.
 */
export const foldColor = (data: Record<string, unknown>): boolean => {
  const open = data.color === COLOR_CUSTOM
  if (open) data.color = data.color_custom
  delete data.color_custom
  return open
}
