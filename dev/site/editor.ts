/**
 * The card's Home Assistant visual editor, driving a live card.
 *
 * Reached exactly the way Home Assistant reaches it — through the card class's static
 * `getConfigElement()` — rather than by creating the editor element directly, so the page
 * exercises the same path the dashboard does and notices if it goes missing.
 *
 * What it does NOT exercise is the widget: `ha-form` here is the stand-in from
 * `ha-stubs.ts`. This panel is for the behaviour — which keys the editor writes, which it
 * removes, what the card does with them. See it drawn properly with `pnpm ha:up`.
 *
 * Loaded when the Advanced section is first opened rather than with the page, because
 * that is also the contract: a card is allowed to code-split its editor, and a caller
 * that never awaited would work here and nowhere else.
 */

import type {
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceCardConstructor,
  LovelaceCardEditor,
} from '../../src/core/types/ha'
import type { Widget } from './catalog'

export interface EditorPanel {
  /** The element, once it has arrived. `undefined` while loading, and if there is none. */
  editor: LovelaceCardEditor | undefined
  /** The config the editor has written so far, and what its preview card draws. */
  config: LovelaceCardConfig
  /** Why there is nothing to show, when there is nothing to show. */
  reason: string | undefined
}

let panel: EditorPanel | undefined
let loading = false

/**
 * Bumped by every reset, and captured by the load in flight at the time.
 *
 * `getConfigElement()` may be a promise — that is the whole reason it is awaited — so a
 * visitor who opens Advanced and immediately switches widget leaves a load running for a
 * card that is no longer on screen. Without this it would land afterwards and install the
 * previous widget's editor into the new one's panel.
 */
let generation = 0

export const editorPanel = (): EditorPanel | undefined => panel

/** Forgets the editor, so the next widget gets its own. */
export function resetEditor(): void {
  panel = undefined
  loading = false
  generation += 1
}

export function pushEditorHass(hass: HomeAssistant): void {
  if (panel?.editor) panel.editor.hass = hass
}

/**
 * Start loading the editor, if it has not been asked for yet.
 *
 * `hass` is set before `setConfig`, the order Home Assistant uses — an editor that reads
 * `hass` inside `setConfig` survives only that one.
 */
export function ensureEditor(
  widget: Widget,
  hass: HomeAssistant,
  onChange: () => void,
): EditorPanel | undefined {
  if (panel || loading) return panel
  loading = true
  const mine = generation

  void (async () => {
    const cardClass = customElements.get(widget.tag) as unknown as
      LovelaceCardConstructor | undefined
    const stub = cardClass?.getStubConfig?.() ?? { type: `custom:${widget.tag}` }

    // Awaited, because Home Assistant awaits it: a card that code-splits its editor
    // returns a promise here, and a page that could not tell the difference would
    // report the one thing this panel exists to report.
    const configured = await cardClass?.getConfigElement?.()

    // The route moved on while that was in flight. Drop the editor on the floor rather
    // than install one widget's editor into another widget's panel.
    if (mine !== generation) return

    if (!(configured instanceof HTMLElement)) {
      panel = {
        editor: undefined,
        config: stub,
        reason: `${widget.tag} has no getConfigElement(), so Home Assistant would show the YAML editor instead.`,
      }
      loading = false
      onChange()
      return
    }

    const editor = configured as LovelaceCardEditor
    const next: EditorPanel = { editor, config: stub, reason: undefined }

    editor.addEventListener('config-changed', event => {
      next.config = (event as CustomEvent<{ config: LovelaceCardConfig }>).detail.config
      // Home Assistant hands the config straight back to the editor after every change,
      // and an editor that only looked right until it was told its own answer would be
      // broken in the dashboard and fine here.
      editor.setConfig(next.config)
      onChange()
    })

    editor.hass = hass
    editor.setConfig(stub)

    panel = next
    loading = false
    onChange()
  })()

  return panel
}
