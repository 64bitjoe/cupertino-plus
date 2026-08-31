/**
 * The chips card's chip list, as one control.
 *
 * A chip is usually an entity plus four things nobody can work out from it — how much of it to
 * draw, which glyph, what to call it, and what a press does — and this draws each row as an
 * `ha-expansion-panel` carrying those fields, with a drag handle beside it and a delete button
 * in its summary. A picker at the bottom adds the next one, and a second, plainer button beside
 * it adds a chip with no entity at all — a spacer, or a chip built entirely from templates.
 * Clearing the Entity field on an existing row does the same thing now: it does not delete the
 * row, only the trash icon does.
 *
 * ## Why an element of its own rather than `ha-form` rows
 *
 * The long version is in `battery/device-list-editor.ts`, which this is deliberately a sibling
 * of rather than a variation on: `ha-sortable` around a wrapper, an `item-moved` event carrying
 * two indices, an empty picker as the add control, and clearing a row's entity as the way to
 * say delete — all of it borrowed from Home Assistant's own `hui-entities-card-row-editor`.
 * The short version is that `ha-form` has no way to hang a drag handle or a bin off a panel,
 * so its `expandable` node can group fields but can never be the list itself.
 *
 * ## The one thing this does that the battery card's does not
 *
 * A tap action is a nested object, and an `ha-form` row reads one key of one flat object. So
 * the action is spread across three sibling fields going in and gathered back up coming out;
 * `chipToForm` and `chipFromForm` in `model.ts` are that pair, kept there rather than here
 * because they are rules about the config and because it is the half of this editor a node
 * test can reach. Home Assistant's own `ui_action` selector would draw the whole control in
 * one row, and it is very likely present in the frontend this card requires — but "very
 * likely" is what made the per-chip form get deferred once already, so this uses only the
 * selectors `docs/ha-api-notes.md` records as checked. Swapping it in later changes this file
 * and nothing else: the config shape is Home Assistant's either way.
 *
 * ## What it may render
 *
 * The same short list the battery card's note sets out, for the same reason: `ha-sortable`,
 * `ha-expansion-panel`, `ha-icon-button`, `ha-svg-icon`, `ha-icon` and `ha-form` are defined by
 * the time an editor is open; `ha-entity-picker` and `ha-icon-picker` are not, and an undefined
 * element renders as nothing at all. Inside a panel that is `ha-selector`'s problem to solve
 * and it does. The add control is the one place it is ours, because `addButton` is a property
 * of the picker rather than something a selector can ask for, so `_pickerReady` waits for the
 * definition and renders a plain `ha-form` field until it arrives — which is also the thing
 * that causes it to arrive.
 */

import { mdiContentCopy, mdiDrag, mdiPlus, mdiTrashCanOutline } from '@mdi/js'
import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit'
import { property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { ACTION_NAMES } from '../../core/actions'
import { moveRow } from '../../core/entities-form'
import { defineElement } from '../../core/register'
import { isTemplate } from '../../core/templates'
import { TINTS } from '../../core/tint'
import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import {
  chipFromForm,
  chipKeys,
  chipRows,
  chipToForm,
  CHIP_CONTENTS,
  COLOR_CUSTOM,
  COLOR_SELECTOR,
  CONTENT_INHERIT,
  inheritedIcon,
  inheritedName,
  readChip,
  type ChipConfig,
} from './model'

export const CHIPS_LIST_TAG = 'cupertino-plus-chips-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface ChipsChangedDetail {
  chips: (string | ChipConfig)[]
}

/**
 * What a chip may point at: anything at all.
 *
 * Stated rather than left implicit, because the battery card's list filters hard and the
 * missing filter here is a decision, not an omission. A chip draws a name, a glyph and a
 * reading, and `core/entity-view.ts` has an answer for all three whatever the domain — a lock,
 * a person, a script, a sensor. There is no class of entity this card is worse at than the
 * chips it is meant to replace, so there is none to hide.
 */
const ANY_ENTITY = { entity: {} } as const

const CONTENT_LABELS: Record<string, string> = {
  [CONTENT_INHERIT]: 'Same as the card',
  icon: 'Icon only',
  value: 'Icon and reading',
  labeled: 'Icon, name and reading',
}

const ACTION_LABELS: Record<string, string> = {
  'more-info': 'Open more-info',
  toggle: 'Toggle it',
  navigate: 'Go to a view',
  'call-service': 'Call a service',
  none: 'Nothing',
}

const option = (labels: Record<string, string>) => (value: string) => ({
  value,
  label: labels[value] ?? value,
})

/**
 * Dropdowns rather than the radio lists `select` would choose for itself.
 *
 * Under six options `ha-selector-select` renders radios, and four of these plus five of those
 * is nine radio buttons inside a panel that already holds four other fields. The mode is a
 * statement about the room a control is in rather than about the options in it, and the room
 * here is an accordion row in a dialog.
 */
const CONTENT_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [CONTENT_INHERIT, ...CHIP_CONTENTS].map(option(CONTENT_LABELS)),
  },
}

const ACTION_SELECTOR = {
  select: { mode: 'dropdown' as const, options: [...ACTION_NAMES].map(option(ACTION_LABELS)) },
}

/**
 * A text field whose placeholder is a real inherited value, or none at all.
 *
 * `exactOptionalPropertyTypes` makes `{ text: { placeholder: undefined } }` a type error — the
 * flag treats an optional property as either present with a real value or entirely absent,
 * never present-and-undefined — so a chip with nothing to inherit (no entity) gets the key left
 * out altogether. That is also the honest answer, not a workaround for the type: there IS no
 * placeholder to promise for an entity-less chip's Icon or Name, because the card draws
 * nothing for either field left empty on one, exactly as it draws nothing for the chip as a
 * whole when every field is.
 */
const textSelector = (placeholder: string | undefined): { text: { placeholder?: string } } =>
  placeholder !== undefined ? { text: { placeholder } } : { text: {} }

const iconSelector = (placeholder: string | undefined): { icon: { placeholder?: string } } =>
  placeholder !== undefined ? { icon: { placeholder } } : { icon: {} }

/**
 * One chip's fields: what the chip *is*, and then what a press *does*.
 *
 * The order is the rules document's own — identity (§1), how much of it to draw (§2), then the
 * press (§7) — and it is the order somebody fills a panel in: an entity, a decision about what
 * it should look like, two overrides they will usually skip, and then the interesting part.
 * The entity is not `required` any more: clearing it is how a chip becomes a spacer or a
 * templated chip, not a mistake the form should flag.
 *
 * The two placeholders are what the card would draw if the fields were left empty, so a panel
 * reads as "this is what you will get" rather than as a blank to be guessed at. They come from
 * `model.ts` rather than from `context: { icon_entity: … }`, so that the promise the greyed-out
 * text makes is kept by the same code that would have to keep it.
 *
 * The last row is the argument the chosen action takes, and there is at most one: an action
 * that needs nothing gets no field, and a `navigation_path` is never shown beside a `toggle`
 * because a control offering an argument that will be ignored is a control that lies. Outside
 * templating mode, that one field is Home Assistant's own view picker rather than a path typed
 * by hand — `NavigationSelector` in `core/types/ha.ts` has what was checked before using it. A
 * template cannot be typed into a picker, so templating mode keeps the plain text box instead.
 *
 * `templating` swaps the Icon and Colour pickers — neither of which a template can be typed
 * into — for plain text boxes, hides the Colour dropdown's own `color_custom` field (moot once
 * `color` is text already), and appends Reading and Show when, which only ever make sense as
 * templates. The switch itself is drawn last, by the element, because it is not a fact about
 * a chip's config at all; see `_templating` on the element.
 */
const chipSchema = (
  hass: HomeAssistant | undefined,
  config: ChipConfig,
  data: Record<string, unknown>,
  templating: boolean,
  first: boolean,
): readonly HaFormSchema[] => {
  const rows: HaFormSchema[] = [
    { name: 'entity', selector: ANY_ENTITY },
    { name: 'content', selector: CONTENT_SELECTOR },
    templating
      ? { name: 'color', selector: { text: {} } }
      : { name: 'color', selector: COLOR_SELECTOR },
    ...(!templating && data.color === COLOR_CUSTOM
      ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
      : []),
    templating
      ? { name: 'icon', selector: { text: {} } }
      : { name: 'icon', selector: iconSelector(inheritedIcon(hass, config.entity)) },
    { name: 'name', selector: textSelector(inheritedName(hass, config.entity)) },
    ...(first ? [] : [{ name: 'break', selector: { boolean: {} } as const }]),
    { name: 'fill', selector: { boolean: {} } },
    { name: 'action', selector: ACTION_SELECTOR },
  ]

  if (data.action === 'navigate') {
    rows.push({
      name: 'navigation_path',
      selector: templating ? { text: { placeholder: '/lovelace/0' } } : { navigation: {} },
    })
  }
  if (data.action === 'call-service') {
    rows.push({ name: 'service', selector: { text: { placeholder: 'script.goodnight' } } })
  }

  if (templating) {
    rows.push({ name: 'value', selector: { text: { placeholder: "{{ states('sensor.a') }}" } } })
    rows.push({
      name: 'show',
      selector: { text: { placeholder: "{{ is_state('light.a','on') }}" } },
    })
  }

  rows.push({ name: 'templating', selector: { boolean: {} } })

  return rows
}

/**
 * The add control, as a plain field, for as long as the real picker is undefined.
 *
 * It excludes what the list already holds, the same as the picker below does. Without it the
 * control offers a chip that is already there, `_addChip` refuses it, and the only thing the
 * user sees is a field that filled itself in and did nothing.
 */
const addSchema = (taken: readonly string[]): readonly HaFormSchema[] => [
  { name: 'entity', selector: { entity: { exclude_entities: [...taken] } } },
]

const LABELS: Record<string, string> = {
  entity: 'Entity',
  content: 'Content',
  color: 'Colour',
  color_custom: 'Custom colour',
  icon: 'Icon',
  name: 'Name',
  action: 'When pressed',
  navigation_path: 'Path',
  service: 'Service',
  templating: 'Use templates',
  break: 'Start a new row',
  fill: 'Push the rest to the far edge',
  value: 'Reading',
  show: 'Show when',
}

/**
 * Not localised, like the rest of the library's own words: Home Assistant has a translated
 * string for a list of entities and none for any of this.
 */
const HELPERS: Record<string, string> = {
  entity: 'Leave this blank for a spacer, or a chip built entirely from templates below.',
  content: 'Overrides the card for this one chip. Every chip still draws at the same height.',
  color: 'Tints the glyph only. The reading and the pill stay one ink.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  icon: "Overrides the entity's own glyph.",
  name: 'The caption in the third content mode, and the screen-reader label in all of them.',
  action: 'A chip set to Nothing is not drawn as a button at all: no tab stop, no pressed state.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  service: 'As domain.service. Its data and target stay in YAML.',
  templating:
    'Swaps the icon and colour pickers for text boxes, so you can write a template in them.',
  break: 'This chip begins a new row. A row still wraps on its own if it runs out of width.',
  fill:
    'This chip stretches to take whatever width is left, pushing every chip after it to the ' +
    'right-hand edge. Usually wanted on a blank chip.',
  value: 'Replaces what the chip prints. Falls back to the entity own reading if it is empty.',
  show: 'The chip is drawn only while this is true. Hidden until it answers.',
}

const ADD_LABEL = 'Add a chip'
const ADD_BLANK_LABEL = 'Add a blank chip'

const ADD_HELPER =
  'Any entity at all: a chip has a name, a glyph and a reading for whatever you point it at. ' +
  'One already in the list is not offered again. A blank chip needs no entity — give it a ' +
  'name, icon or reading of its own below, with a template or a plain one, or leave it empty ' +
  'as a spacer.'

class CupertinoChipsList extends LitElement {
  /**
   * Home Assistant's own furniture, not ours: no `--cw-*` token appears here, for the reason
   * `CupertinoCardEditor` gives — a widget that looks like a phone's should still have a config
   * panel that looks like the dialog it is sitting in. The rules below are the battery list's,
   * kept identical on purpose: two list controls in one library that were spaced differently
   * would read as two libraries.
   */
  static override styles: CSSResultGroup = css`
    :host {
      display: block;
    }

    .chips {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Aligned to the top rather than centred: the panel grows downwards when it is opened,
       and a handle that centred itself against an expanded panel would drift away from the row
       it drags. 48px is ha-expansion-panel's own summary height. */
    .chip {
      display: flex;
      align-items: flex-start;
    }

    .handle {
      display: flex;
      align-items: center;
      height: 48px;
      padding-inline-end: 8px;
      color: var(--secondary-text-color);
      cursor: grab;
    }

    /* Otherwise a drag that starts on the glyph is a drag of the glyph, and the row stays
       where it is. */
    .handle > * {
      pointer-events: none;
    }

    ha-expansion-panel {
      flex: 1;
      min-width: 0;
    }

    ha-expansion-panel ha-icon {
      color: var(--secondary-text-color);
    }

    .remove {
      --ha-icon-button-size: 36px;
      color: var(--secondary-text-color);
    }

    .fields {
      display: block;
      padding: 8px 0 16px;
    }

    .add {
      margin-top: 16px;
    }

    /* A plain element rather than an HA custom one: unlike ha-entity-picker, whose fallback
       while undefined is documented at the top of this file, nothing else here needs this
       button to exist before it can be pressed, so there is no reason to risk it rendering as
       nothing during the same window ha-entity-picker sometimes does.

       Drawn as a real outlined button on its own line rather than the bare text link this was
       first shipped as. Sitting inline beside the picker's own solid button, a borderless link
       read as that button's caption rather than as the second of two ways to add a chip, and
       the feature was reported missing twice by somebody looking straight at it. Outlined
       rather than solid keeps the ordinary path visually primary. */
    .blank {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 8px;
      padding: 0 16px;
      height: 40px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      border-radius: 9999px;
      background: none;
      color: var(--primary-color);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .blank:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }

    .blank:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    /* The add control's own line rather than the helper of whichever of the two controls is
       standing there: the button mode draws no helper, and a hint that came and went with the
       control would be a hint nobody reads. */
    .hint {
      margin: 6px 0 0;
      color: var(--secondary-text-color);
      font-size: 12px;
    }

    .empty {
      margin: 0 0 16px;
      color: var(--secondary-text-color);
      font-size: 13px;
    }
  `

  @property({ attribute: false }) public hass?: HomeAssistant

  /** Normalised by the editor, so every row here is known to have an entity in it. */
  @property({ attribute: false }) public chips: readonly ChipConfig[] = []

  /**
   * Whether `ha-entity-picker` has been defined yet, and so whether the add control can be
   * the button. It resolves itself; see the note at the top of the file.
   */
  @state() private _pickerReady = customElements.get('ha-entity-picker') !== undefined

  /**
   * Which panels are open, by row key.
   *
   * Held here rather than left to each `ha-expansion-panel`, because this element re-renders
   * from the config on every keystroke: an `expanded` that only lived in the panel would be
   * whatever the recycled DOM node happened to have. By key and not by position so a dragged
   * row keeps its panel open, which is also why the rows are keyed below.
   */
  private readonly _open = new Set<string>()

  /**
   * Which chips are showing their template fields, by row key.
   *
   * A view of a row rather than a property of one, so it writes no config key — the same
   * arrangement `_open` already uses for which panels are expanded. `icon` is an icon picker
   * and `color` is a dropdown, and a template cannot be typed into either; this switch swaps
   * both for plain text boxes and reveals the two fields that only make sense as templates.
   */
  private readonly _templating = new Set<string>()

  /**
   * On by default for a chip whose config already holds a template, so a config written in
   * YAML opens showing what it actually says rather than a picker that cannot represent it.
   * `_addBlank` seeds this set for the same reason on a freshly added blank chip — templates
   * and literals are the only way an entity-less row ever gets content, so it opens ready for
   * one — but it is a starting point rather than a rule: the switch can still be turned off
   * afterwards for a chip that only ever wanted a plain icon and name.
   */
  private _isTemplating(config: ChipConfig, key: string): boolean {
    if (this._templating.has(key)) return true
    return [config.name, config.icon, config.color, config.value, config.show].some(isTemplate)
  }

  /**
   * Which chips are showing the custom-colour text box, by row key.
   *
   * A view of a row, exactly like `_templating` above: selecting "Custom…" from the Colour
   * dropdown has nothing to write into the config until a value is typed into the field beside
   * it. Without holding that choice somewhere of its own, the very re-render the dropdown's own
   * change causes would find `color` still unset, decide the row was never in custom mode, and
   * the field the user just asked for would never appear.
   */
  private readonly _colorCustom = new Set<string>()

  private readonly _computeLabel = (schema: HaFormSchema): string =>
    LABELS[schema.name] ?? schema.name

  private readonly _computeHelper = (schema: HaFormSchema): string | undefined =>
    HELPERS[schema.name]

  private readonly _computeAddLabel = (): string => ADD_LABEL

  public override connectedCallback(): void {
    super.connectedCallback()
    if (this._pickerReady) return
    void customElements.whenDefined('ha-entity-picker').then(() => {
      this._pickerReady = true
    })
  }

  private _emit(rows: readonly ChipConfig[]): void {
    this.dispatchEvent(
      new CustomEvent<ChipsChangedDetail>('chips-changed', {
        detail: { chips: chipRows(rows) },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * One row's form reported. It carries the whole row, so it replaces the whole row.
   *
   * `chipFromForm` never drops a row any more — clearing the Entity field turns a chip into a
   * spacer or a templated chip rather than deleting it, so every edit here replaces the row in
   * place. The trash icon (`_remove`) is the only way this control removes one.
   */
  private readonly _rowChanged = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
    index: number,
    key: string,
  ): void => {
    event.stopPropagation()

    const prior = this.chips[index]
    if (!prior) return

    // The switch is a view of the row, not a fact about its config: read it into `_templating`
    // and then remove it, so it never reaches `chipFromForm` or the config beyond it.
    const value = { ...event.detail.value }
    if (typeof value.templating === 'boolean') {
      if (value.templating) this._templating.add(key)
      else this._templating.delete(key)
    }
    delete value.templating

    // Remembered the same way as the switch above, and for the same reason: the dropdown
    // reporting `COLOR_CUSTOM` is the only moment this editor learns the row wants the text
    // box, and nothing about a still-empty `color_custom` belongs in the config.
    if (value.color === COLOR_CUSTOM) this._colorCustom.add(key)
    else this._colorCustom.delete(key)

    // The dropdown and its custom field are two controls for one key. Folded here rather than
    // in `chipFromForm`, which is a rule about the config and should not know that the editor
    // draws this as two things.
    if (value.color === COLOR_CUSTOM) value.color = value.color_custom
    delete value.color_custom

    const row = chipFromForm(prior, value)
    const next = [...this.chips]
    next[index] = row

    // The panel stays open across the rename that a changed entity amounts to. Only for a row
    // whose key is its own entity id: a `#1` suffix or a `#<index>` spacer key is positional
    // (see `chipKeys`), and the new one is not this row's to guess — the same cost that
    // function's own note already accepts for a dragged duplicate, extended here to a spacer
    // that gains or loses its entity.
    if (
      prior.entity !== undefined &&
      key === prior.entity &&
      prior.entity !== row.entity &&
      row.entity !== undefined &&
      this._open.delete(key)
    ) {
      this._open.add(row.entity)
    }

    this._emit(next)
  }

  private readonly _remove = (event: Event, index: number, key: string): void => {
    // `ha-expansion-panel` toggles on any click inside its summary unless the event has been
    // defaulted away: `_toggleContainer` opens with `if (e.defaultPrevented) return`. Without
    // this the row would be deleted and the panel above it would open.
    event.preventDefault()
    event.stopPropagation()

    this._open.delete(key)
    const next = [...this.chips]
    next.splice(index, 1)
    this._emit(next)
  }

  /**
   * A copy of one chip, inserted directly below it.
   *
   * Deliberately allowed to produce two chips pointing at one entity, which is the one thing
   * the add picker refuses: that refusal is about a picker offering a candidate it would then
   * reject, not about the config being invalid. `chipKeys` has always keyed the second
   * occurrence positionally, and the rules doc has always said such a config draws both chips
   * and is fully editable — this is the button that makes it reachable without the YAML tab.
   *
   * The clone is deep enough for the one nested object a chip has (`tap_action`), so editing
   * the copy's action cannot reach back and rewrite the original's.
   */
  private readonly _duplicate = (event: Event, index: number): void => {
    // `ha-expansion-panel` opens on any click in its summary that has not been defaulted away
    // -- the same reason `_remove` starts with these two lines.
    event.preventDefault()
    event.stopPropagation()

    const source = this.chips[index]
    if (!source) return

    const copy: ChipConfig = { ...source }
    if (source.tap_action) copy.tap_action = { ...source.tap_action }

    const next = [...this.chips]
    next.splice(index + 1, 0, copy)
    this._emit(next)
  }

  private readonly _moved = (event: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    event.stopPropagation()
    this._emit(moveRow(this.chips, event.detail.oldIndex, event.detail.newIndex))
  }

  /**
   * The native picker in `addButton` mode reports the id it was given, as a bare string.
   *
   * Nothing to reset afterwards: in that mode the picker passes `undefined` down as its value
   * whatever it holds, so it goes back to being a button by itself.
   */
  private readonly _addPicked = (event: CustomEvent<{ value?: string }>): void => {
    event.stopPropagation()
    this._addChip(event.detail.value)
  }

  /** The same thing through the `ha-form` field, which reports the row as an object. */
  private readonly _addFromField = (
    event: CustomEvent<{ value: Record<string, unknown> }>,
  ): void => {
    event.stopPropagation()
    const entity = event.detail.value.entity
    this._addChip(typeof entity === 'string' ? entity : undefined)
  }

  /**
   * Nothing happens for the empty value a cleared picker reports, and a duplicate is refused.
   *
   * Refused rather than allowed, even though the card itself draws a config that names one
   * entity twice and `chipKeys` keeps this control working on one: neither control offers a
   * candidate that is already in the list, and adding it anyway would produce a row whose
   * panel closes when its twin is dragged past it. Somebody who genuinely wants two chips for
   * one entity can write the second in YAML, and everything here still edits it.
   *
   * The new chip's panel opens itself, because a chip that has just been added is the one
   * whose press somebody is most likely about to set.
   */
  private _addChip(entity: string | undefined): void {
    if (entity === undefined || entity === '') return
    if (this.chips.some(chip => chip.entity === entity)) return

    this._open.add(entity)
    this._emit([...this.chips, { entity }])
  }

  /**
   * A chip with nothing selected: a spacer until something is configured on it. Opened
   * straight into template mode (`_templating`'s own note has why) and expanded immediately,
   * for the same reason `_addChip` opens an entity-bearing chip's panel: the row just added is
   * the one somebody is most likely about to fill in.
   *
   * The key it seeds both sets with has to be the one `chipKeys` will actually give this row
   * once it renders: a fresh entity-less row is keyed by its own index (see `chipKeys`), and
   * appending to the end means that index is exactly the list's current length.
   */
  private readonly _addBlank = (): void => {
    const key = `#${this.chips.length}`
    this._open.add(key)
    this._templating.add(key)
    this._emit([...this.chips, {}])
  }

  private readonly _toggled = (event: CustomEvent<{ expanded: boolean }>, key: string): void => {
    if (event.detail.expanded) this._open.add(key)
    else this._open.delete(key)
  }

  private _renderChip(config: ChipConfig, index: number, key: string): TemplateResult {
    // Name and glyph as the card is drawing them right now, overrides included, so a row is
    // recognisable in the editor by the same two things it has on the dashboard.
    const chip = readChip(this.hass, config)
    const templating = this._isTemplating(config, key)
    const data = chipToForm(config)

    // Split on the way in, undone in `_rowChanged`: the dropdown holds a palette name, `''`,
    // or the `COLOR_CUSTOM` sentinel, and `color_custom` holds the literal. Moot in templating
    // mode, where `color` is already a plain text box showing the config's raw value.
    //
    // `_colorCustom.has(key)` alone carries a row that has just been switched into custom mode
    // but has nothing typed into it yet — the config has no colour to show, so the value-based
    // check below cannot see it. But a config that now names a real palette colour is never
    // "type your own" mode, however it got there: `setConfig` is called again for every later
    // change, including one made in the YAML tab that never goes through `_rowChanged` at all.
    // Left uncleared, a chip switched to `Custom…` and back to a plain `color: red` in YAML
    // would still show "Custom…" here with "red" pre-filled into the text box — a valid
    // palette name misrepresented as a custom one. So a genuine tint always wins and clears
    // the flag; only then does the flag get to speak for an otherwise-empty colour.
    if (!templating) {
      const configured = typeof data.color === 'string' ? data.color : ''
      if (configured && (TINTS as readonly string[]).includes(configured)) {
        this._colorCustom.delete(key)
      } else if (this._colorCustom.has(key) || configured) {
        data.color = COLOR_CUSTOM
        data.color_custom = configured
      }
    }
    data.templating = templating

    // `chip.name` is only ever blank for an entity-less row — an entity-bearing one always has
    // at least its own id to fall back on (`readChip`'s own contract) — so these two fallbacks
    // only ever fire there, and only until something is configured.
    const header = chip.name !== '' ? chip.name : chip.spacer ? 'Blank chip' : 'Chip'
    const secondary = config.entity ?? (chip.spacer ? 'Spacer — no entity' : 'No entity')
    // `mdi:eye` (`FALLBACK_ICON`) is the "configured but not found" glyph; using it here for a
    // chip that was never configured to have one would say the wrong thing.
    const icon = chip.icon !== '' ? chip.icon : chip.spacer ? 'mdi:minus' : 'mdi:code-braces'

    return html`
      <div class="chip">
        <div class="handle">
          <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
        </div>
        <ha-expansion-panel
          outlined
          .header=${header}
          .secondary=${secondary}
          .expanded=${this._open.has(key)}
          @expanded-changed=${(event: CustomEvent<{ expanded: boolean }>) =>
            this._toggled(event, key)}
        >
          <ha-icon slot="leading-icon" .icon=${icon}></ha-icon>
          <ha-icon-button
            slot="icons"
            class="remove"
            .path=${mdiContentCopy}
            .label=${`Duplicate ${header}`}
            @click=${(event: Event) => this._duplicate(event, index)}
          ></ha-icon-button>
          <ha-icon-button
            slot="icons"
            class="remove"
            .path=${mdiTrashCanOutline}
            .label=${`Remove ${header}`}
            @click=${(event: Event) => this._remove(event, index, key)}
          ></ha-icon-button>
          <ha-form
            class="fields"
            .hass=${this.hass}
            .data=${data}
            .schema=${chipSchema(this.hass, config, data, templating, index === 0)}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) =>
              this._rowChanged(event, index, key)}
          ></ha-form>
        </ha-expansion-panel>
      </div>
    `
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing

    // Only the chips that actually have one: excluding `undefined` from the picker's exclusion
    // list would be harmless (nothing in an installation is ever named "undefined"), but it is
    // one more reason not to bother reasoning about, and the type is honest either way.
    const taken = this.chips.flatMap(chip => (chip.entity !== undefined ? [chip.entity] : []))
    const keys = chipKeys(this.chips)

    return html`
      ${
        this.chips.length === 0
          ? html`<p class="empty">No chips yet. The card will say so too.</p>`
          : nothing
      }
      <!-- The wrapper is required rather than tidy: ha-sortable makes its FIRST child
           sortable, so without one the rows would not be the things being dragged. The rows
           are keyed so that a drag moves the row rather than rewriting every row's contents,
           which is what keeps an open panel open and the caret where it was. ha-sortable rolls
           its own DOM change back on drop and leaves the reordering to this render, so the key
           is the whole of what makes a drag land. -->
      <ha-sortable handle-selector=".handle" @item-moved=${this._moved}>
        <div class="chips">
          ${repeat(
            this.chips,
            (_chip, index) => keys[index] as string,
            (chip, index) => this._renderChip(chip, index, keys[index] as string),
          )}
        </div>
      </ha-sortable>
      <div class="add">
        ${
          this._pickerReady
            ? // Home Assistant's own add control, and the reason for the wait above: with
              // `add-button` the picker renders as a button whose press opens the list, all
              // inside the one element. No domain list is passed, because this card takes any
              // entity there is.
              html`
                <ha-entity-picker
                  add-button
                  .hass=${this.hass}
                  .addButtonLabel=${ADD_LABEL}
                  .excludeEntities=${taken}
                  @value-changed=${this._addPicked}
                ></ha-entity-picker>
              `
            : html`
                <ha-form
                  .hass=${this.hass}
                  .data=${{}}
                  .schema=${addSchema(taken)}
                  .computeLabel=${this._computeAddLabel}
                  @value-changed=${this._addFromField}
                ></ha-form>
              `
        }
        <button type="button" class="blank" @click=${this._addBlank}>
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>${ADD_BLANK_LABEL}
        </button>
        <p class="hint">${ADD_HELPER}</p>
      </div>
    `
  }
}

defineElement(CHIPS_LIST_TAG, CupertinoChipsList)

export { CupertinoChipsList }
