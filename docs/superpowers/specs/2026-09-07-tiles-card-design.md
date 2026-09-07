# The tiles card

A sixth card: a wrapping grid of small rounded tiles, each one an icon, a name and a line of
state, each one a press away from somewhere. The Home Screen app grid, where the chips card is
the Lock Screen accessory strip.

It exists to replace the four button-cards sitting under the chips on the HomeOS dashboard —
Garage, Climate, Scenes, Cats — which come from a different library and read as belonging to
one. That is a sharper requirement than "another card": a tile that cannot summarise three
garage doors as `All Closed`, or navigate somewhere with no entity behind it at all, is not a
replacement for what is there.

Written 2026-09-07, against the library as of `v1.13.0` (calendar, battery, complication,
weather, chips). Sibling to
[`2026-08-09-widget-family-design.md`](2026-08-09-widget-family-design.md), which did not
anticipate this card, and to
[`2026-08-16-lock-screen-chips-design.md`](2026-08-16-lock-screen-chips-design.md), whose rules
this one deliberately inverts in one place (§3).

---

## 1. What a tile is

```ts
{
  entityId: string | undefined, // identity, and what a press acts on; optional, see §6
  name: string,                 // drawn, unlike a chip's name in two of its three modes
  icon: string,                 // an `mdi:` name for `ha-icon`
  picture: string | undefined,  // an entity_picture, drawn in the icon's place
  value: string,                // the state line; an em dash for nothing to read
  color: string | undefined,    // a resolved CSS value: the glyph, and a wash behind it
  unavailable: boolean,
  visible: boolean,             // a `show` template said so
  action: ActionConfig
}
```

`model.ts` is the whole of the card's contact with `hass`, the same split every other card in
the library makes. Everything downstream draws a `TileView` and knows nothing about entities.

**A tile is a Home Screen object.** That single sentence decides most of what follows and is
what separates this card from the chips card rather than making it a wider version of one. A
chip is a monochrome mark on somebody else's wallpaper; a tile is a coloured object with a name
on it, sitting in a grid of its peers. The chips rules document draws exactly this distinction
in its §3 and spends a page defending the monochrome side of it. This card is the other side,
and where the two disagree the disagreement is the point rather than an inconsistency.

## 2. The grid

**Tiles are a fixed width and wrap.** As many fit on a line as the section allows: two across in
a narrow column, four in a wide one, reflowing rather than cramping. No `columns:` setting.

That is not the obvious choice — Home Assistant's own grid card takes a column count, and it is
what most custom cards do — so it is worth saying why. A `columns: 4` card dragged narrow gives
four cramped tiles; a wrapping one gives two rows of two. The card already knows how wide it is,
and a number the user has to keep in sync with a width they can drag is a number that will be
wrong. It is also the arrangement the chips card arrived at after four releases of getting the
arithmetic wrong, and reusing that hard-won code is worth more than matching a convention.

**The floor arithmetic is the chips card's, extracted rather than copied.** `groupRows`,
`floorsFor` and the content-priced `widthOf` all move to `core/wrapping.ts` generic over "a thing
with a width", and both cards read them. A second copy would drift on exactly the details nobody
re-derives, and this module's details were each earned by a bug: the width must come from the
measurement rather than an assumed section, each item must be priced from what it actually
draws, a filling item costs nothing, and the container's inset has to be told rather than
assumed. Writing those four out again from memory is how they come back.

A tile is nominally **112 units wide by 96 tall**: wide enough for a two-word name at footnote
size, and a 4:3.5 shape close to what the cards being replaced use. Unlike a chip it does not
size to its content — a grid of ragged-width tiles is not a grid — so `widthOf` answers a
constant for it, which is the degenerate case of the same function rather than a second one.

## 3. Colour: a tile has an identity

**A tile tints itself from what its entity is, and a per-tile `color` overrides that.**

This is the chips card's §3 turned over, and deliberately. That rule says a chip opts out of
identity because a Lock Screen accessory is a mark in one ink; the argument is good and it is
about the Lock Screen. A Home Screen tile is the opposite object — it is the thing that
_carries_ an identity, which is why the four cards being replaced are individually coloured and
why nobody configured them that way one at a time.

`complication/tint.ts`'s `tintFor` already answers "what colour is this kind of entity" —
temperature orange, lock red, light yellow, `accent` for what neither table knows — and has since
the complication card shipped. It moves to `core/tint.ts` beside the palette that moved there
already. Chips do not call it, and that is what keeps them monochrome.

The colour paints the glyph and a wash behind it, exactly as a tinted chip now does (v1.13.0), at
the same weights and with the same three cases: light glass, dark glass lit from the top edge,
and card mode mixed into the opaque track. The name and the state line stay one ink for the
reason `core/ring.ts` gives about colour that moves with a value.

**An unavailable tile drops its colour**, like every other card here. The dimming is the signal;
a crisp tint undercuts it.

## 4. Templates, and a tile with no entity

Both are the chips card's, unchanged, and adopted rather than re-argued.

`name`, `icon`, `color`, `value` and `show` may each be a template — a string holding `{{` or
`{%` — resolved through `core/templates.ts`'s subscription pool, which deduplicates by template
plus variables and prunes what a card stops wanting. `{{ config.entity }}` is in scope, so one
template serves every tile. `entity` is never templatable: it is the row's identity, and
`watchedEntities()` needs it before anything resolves.

`entity` is **optional**. A tile with none and a `name`/`icon` of its own is a navigation tile —
which is what Climate, Scenes and Cats actually are in the config being replaced. Unlike a chip,
an entity-less tile is not a spacer: a tile is a labelled object, and one with a name and an icon
has plenty to draw. There is no spacer concept here at all, because a grid of fixed-width tiles
has no use for one.

The default press for an entity-less tile is `none` rather than `more-info`, for the chips card's
reason: there is nothing to open.

## 5. The state line

A tile draws three things and the third is the one worth specifying: `value` is the entity's
formatted state through `core/entity-view.ts` — so a tile and a chip and a complication never
disagree about what a thermostat reads — unless a `value` template replaces it.

**An em dash when there is nothing to read**, and that is a real case here rather than an edge
one: a navigation tile has no state, and the cards being replaced draw exactly that (`Climate –`,
`Scenes –`). A tile whose `value` resolves empty draws the dash rather than collapsing, because a
grid of tiles with and without a third line would be ragged where the chips row was not.

## 6. The container, and the press

Both inherited. `container: glass | card` means what it means on the chips card, including that
glass insets by nothing in either direction — the fix that ended the chips sizing saga and the
one thing most likely to be re-broken by writing a second card's padding from scratch.

The press is `core/actions.ts`: `more-info`, `toggle`, `navigate`, `call-service`, `none`, with
the same rule that a tile set to `none` is not drawn as a button — no role, no tab stop, no
pressed state.

## 7. The editor

`tile-list-editor.ts`, a sibling of `chip-list-editor.ts` rather than a variation on it: a
sortable list of `ha-expansion-panel`s, a drag handle, a duplicate button, a delete button, an
entity picker to add and a plain button to add one without an entity. Per-tile fields are entity,
name, icon, colour (the ten palette names plus `Custom…`), the tap action and its one argument,
and the template switch that swaps the pickers for text boxes.

Everything in that paragraph exists. The honest description of this file is that it is the chips
list editor with a different row shape, and the plan should look hard at whether the shared parts
belong in `core/` before writing a third one — the battery card's list editor was the first, the
chips card's the second, and three copies of a sortable panel list is where the drift starts.

## 8. What is genuinely new

Worth stating plainly, because most of this document is "the same as the chips card":

- the tile's own layout and stylesheet — a fixed-size rounded rect with an icon, a name and a
  state line, rather than a pill;
- `tintFor` becoming shared, and a card that calls it;
- the wrapping arithmetic becoming generic over "a thing with a width".

Everything else is adoption. That is the argument for building it as a sixth card rather than a
sixth complication style: the parts are all here, and what is missing is a shape.

## 9. Assumptions flagged for review

- **112 × 96 units.** Chosen from the cards being replaced, not measured against them. The first
  screenshot will settle it, and it is one constant.
- **`tintFor`'s tables suit tiles.** They were written for complications and have never been
  looked at with a grid of shortcuts in mind. A `cover` reading indigo and a `scene` reading
  `accent` are guesses that a real dashboard will correct.
- **Three copies of the list editor.** Recorded as a decision the plan must make rather than one
  this document makes: extracting it is right in principle and a large refactor of two shipped
  editors in practice.

## 10. Out of scope

- **A `columns:` setting** (§2), unless wrapping turns out to be wrong in use.
- **Spacers, filling or otherwise.** A fixed-width grid has no use for one (§4).
- **Per-tile size.** Every tile in a card is the same size; a grid where they are not is not a
  grid.
- **`hold_action` and `double_tap_action`**, still, as everywhere else in this library.
