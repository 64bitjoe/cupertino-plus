# Lock-screen chips

A fifth card: a row of small pills, each an entity, each tappable — the Lock Screen accessory
family rather than the Home Screen widget family the other four cards draw.

It exists to replace the chip rows already on the HomeOS and HomeOS-2 dashboards, which is a
sharper requirement than "another card": a chip that cannot navigate or toggle is not a
replacement for one that can, however well it reads.

Written 2026-08-16, against the library as of `v1.5.0` (calendar, battery, complication,
weather). Sibling to [`2026-08-09-widget-family-design.md`](2026-08-09-widget-family-design.md),
which did not anticipate this card; it slots into that document's build order ahead of media,
lists and photo.

---

## 1. What a chip is

An entity, drawn as small as it can be drawn and still be read and pressed. A glyph, usually a
reading, optionally a caption. No gauge, no arc, no supporting line, no colour of its own.

The idiom is Apple's Lock Screen accessory set — `accessoryCircular`, `accessoryRectangular`,
`accessoryInline` — and the distinction from the complication card matters, because the two
look superficially alike and follow opposite rules. A Home Screen widget is a self-contained
coloured object. A Lock Screen accessory is a monochrome mark sitting on somebody else's
wallpaper, and everything below follows from that one difference.

The card draws one chip as happily as eight. There is no separate "single chip" mode: a row of
one is a row.

## 2. Where it lives

A new card, `cupertino-plus-chips`, in `src/cards/chips/`:

| File                   | Job                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `chips-card.ts`        | The element: measures, draws the flow, owns tap and keyboard |
| `model.ts`             | Config + `hass` → `ChipView[]`                               |
| `layout.ts`            | Flow packing, wrapping, and the floors that follow from them |
| `chips-card-editor.ts` | Entity rows, per-chip content mode, per-chip action          |

Not a sixth style on the complication card. That card has rules — the colour is identity (§2),
the ring appears only against a real range (§3), a supporting line under the reading (§8) — and
a chip contradicts every one of them while adding a tap action no other style has. A sixth
style would mean "except for chips" in four places in a shipped rules document. The weather
card set the precedent: reuse `core/`, and go your own way.

Three modules move to `core/`, each because a second card now needs it. §10 of the family spec
already names this test — the same argument that moved `ring.ts`.

- **`core/entity-view.ts`** — `iconFor`, `formatValue`, `numberOf`, the unavailable set and its
  dash, name resolution. `complication/model.ts` keeps what is genuinely its own (the
  supporting line, ranges, tints) and imports the rest. Two findings deferred from the
  complication review get fixed here rather than copied: a non-numeric fallback leaving
  underscores in place (`not_home` rendering as `Not_home`), and unit spacing being `%`-only,
  so a bare `°` renders as `21.4 °`. The complication card's existing tests are the net under
  the extraction.
- **`core/actions.ts`** — new. The action config type and the dispatch that runs it.
- **`core/entities-form.ts`** — `mergeEntities`, out of the complication editor. Chips need the
  identical round-trip, and that function exists because of a real bug: HA's multiple-entity
  picker emits `string[]`, so opening the editor on object-form rows and touching entities
  wrote a bare id list over them, destroying every per-row override silently. Copying it into a
  second editor is how that bug comes back.

`tint.ts`, `range.ts` and `core/ring.ts` stay exactly where they are. A monochrome chip with no
gauge touches none of them.

## 3. The three content modes

Set per card, overridable per chip.

| Mode      | Draws                                                             |
| --------- | ----------------------------------------------------------------- |
| `icon`    | The glyph alone                                                   |
| `value`   | Glyph + reading — **the default**                                 |
| `labeled` | Glyph, a small uppercase caption, and the reading stacked beneath |

The caption in `labeled` mode is the chip's name, which is the entity's `friendly_name` unless
a per-chip `name` overrides it — the same resolution `core/entity-view.ts` gives every other
card, and the same string §10 uses for the accessible name. The other two modes carry that name
only in the accessible name, never on screen.

A `labeled` chip is two lines tall where the other two are one. Mixing them freely would give a
ragged band of different heights, so: **every chip in a card draws at the height of the tallest
mode present.** One `labeled` chip promotes the whole row to two lines rather than standing
proud of its neighbours. This is the same instinct behind the battery card refusing to draw
"one row of four with a stub beneath it" — a widget that looks like it ran out of something
reads worse than one that is deliberately uniform.

## 4. The colour: this card opts out of identity

The complication card's §2 says colour comes from what the entity measures and then holds
still. **Chips have no per-entity colour at all**, and that is a deliberate departure rather
than an omission.

The reason is the idiom. A Lock Screen accessory is rendered in one vibrant ink over the
wallpaper, and the whole point of the row is that it reads as one quiet band. Eight tinted
pills is eight competing dots — the failure the complication card's own §2 warns about when it
refuses to let colour track a value, arriving by a different route.

One ink, from `--cw-label`, and a scrim from the same family. Not forced white: `--cw-label` is
near-white on a dark theme and near-black on a light one, which is exactly the behaviour wanted
here and exactly the behaviour the complication card had to avoid for its painted tints.

## 5. The two containers

`container: 'glass' | 'card'`, defaulting to `glass`.

**`glass`** — `ha-card` draws no surface, no border and no shadow, and each pill carries a
translucent scrim plus `backdrop-filter: blur() saturate()`. The pills float directly on the
view. This is the Lock Screen reading and the reason the card exists.

The mechanism is worth stating because it constrains the implementation: `backdrop-filter`
samples whatever is painted behind the element, so the blur only does anything if the card is
transparent the whole way down. Every other card in this library paints a surface. This is the
first one that must not.

**`card`** — the normal card surface, with pills on a flat theme scrim and **no blur**, because
blurring against an opaque card samples the card and achieves nothing but cost.

### The contrast limitation, stated rather than solved

Over a photographic wallpaper, no theme can know what sits behind any given pill. A light theme
over a dark photo will fight; so will the reverse. There is no runtime mechanism in this
codebase for sampling a background image, and inventing one for a chip row is not proportionate.

So the limitation is disclosed, and `container: 'card'` is the answer to it — an opaque surface
underneath restores a known background. This is the same shape of disclosure the complication
card makes about `accent`, which resolves to white on-tint because a theme-defined colour cannot
be contrast-checked at build time.

## 6. Flow, wrapping, and the floors

Chips are content-width, laid left to right from the start edge, wrapping when they run out of
room. Within a chip a long reading truncates at a maximum width, so one verbose sensor cannot
eat an entire line.

The card **never scrolls and never truncates the list**. That is §5 and §6 of the complication
rules, and chips are held to it: what a box too small to hold every chip produces is not a
hidden chip, it is a taller card. `getGridOptions()` floors grow with the number of chips and
the content mode, so Home Assistant will not let the box be dragged below what the chips need.

Every length is in design units — pixels at `scale: 1` — and the measured box is divided by the
scale factor once, as in `battery/layout.ts`, `complication/layout.ts` and `weather/layout.ts`.

`small`, `medium` and `large` do not appear in this card's layout. A chip row is the same row at
every footprint; only how many fit per line changes, and that is a measurement, not a mode.

## 7. Tap actions

The config is Home Assistant's, not this library's: `tap_action`, carrying the standard object
shape (`{ action: 'navigate', navigation_path: '/lovelace/0' }`). YAML already written against
mushroom chips transfers unchanged, and so does the user's memory of it.

Five actions, and deliberately not more:

| `action`       | Behaviour                                              |
| -------------- | ------------------------------------------------------ |
| `more-info`    | Fires `hass-more-info` — **the default**               |
| `toggle`       | `homeassistant.toggle` against the chip's entity       |
| `navigate`     | `cwNavigate` with `navigation_path`                    |
| `call-service` | `hass.callService` with `service`, `data` and `target` |
| `none`         | Nothing, and no pressable affordance is drawn          |

`core/actions.ts` is a dispatch table taking `(hass, element, config, entityId)`. It takes its
collaborators as arguments rather than reaching for globals, which is what makes it testable in
the node environment this suite actually runs in.

`hold_action`, `double_tap_action`, `url` and `assist` are out of scope. All four are additive
to this same config shape; none of them changes the design if they arrive later.

## 8. The editor

Entity rows as the complication editor draws them, through the now-shared `mergeEntities`, plus
a per-chip expandable section carrying the content mode and the tap action. Card-level: the
default content mode, the container, and the library-wide scale.

Two things the repo's type layer does not model yet and this needs: an `expandable` form node,
and HA's `ui_action` selector for the action picker. `core/types/ha.ts` already notes that
`ha-form` accepts nodes carrying a `type` instead of a `selector` and that no editor here has
needed one.

## 9. Degradation

- **Entity missing from `hass.states`** — the chip still draws, with the dashed placeholder. It
  has a configured identity to draw against, so this follows the complication card rather than
  the weather card, which returns null because it has nothing of its own to show.
- **`unavailable` / `unknown`** — dashed and dimmed, the library's existing contract.
- **A `toggle` or `call-service` that fails** — a `console.warn` naming the service, and
  nothing else. There is no toast mechanism in this library and this card does not add one.
- **`navigate` to a path that does not exist** — Home Assistant's own problem to report; the
  card has already handed off.

## 10. Accessibility

The visual pill is around 30 design units tall, which is too small to be a touch target now
that a press can toggle something. Each chip is a `role="button"` with `tabindex="0"` whose hit
box is padded to at least 44 units tall, with the pill drawn inside it — the affordance stays
small, the target does not.

Enter and Space activate, matching every other card here. The accessible name is the chip's name
and its reading, not the glyph. A chip with `action: 'none'` is not a button: no role, no tab
stop, no pressable styling.

## 11. Assumptions flagged for review

- **`ui_action` selector.** Assumed to exist in the frontend and to be renderable by `ha-form`.
  Not verified — this environment has no `docker` to grep a live bundle with, the same gap
  `docs/ha-api-notes.md` records for the weather subscription. The plan carries a verification
  step and a fallback: a plain select plus conditional fields, which uses only selectors already
  proven here.
- **`expandable` form nodes.** Same status, same fallback (a flat form with prefixed field
  names).
- **`backdrop-filter` inside the card's shadow DOM.** Expected to sample the dashboard
  background once `ha-card` is transparent. Browser support is universal in the versions Home
  Assistant targets, but the interaction with HA's own stacking contexts is unverified until a
  screenshot exists.

## 12. Testing, and what cannot be tested

Under vitest, in the node environment the suite runs in: the chip model including every content
mode and the unavailable path; the flow arithmetic and the floors it produces; the extracted
`core/entity-view.ts`, including the two bugs it inherits and fixes; and `core/actions.ts`'s
dispatch against a stub `hass`.

By screenshot, in the showcase: glass over a wallpaper, `card` mode, all three content modes, a
row that wraps, and an unavailable chip. This is not decoration — reading generated screenshots
is what caught the circular caption overflow and the `rectangular-bleed` that did not bleed, and
neither would have failed a test.

Not covered, and stated plainly rather than implied: the element's own lifecycle, and the real
`ha-form` behaviour behind §11's two assumptions. The suite is `environment: 'node'` and there
is no harness here that mounts an element.

## 13. Out of scope

Hold and double-tap actions. `url` and `assist` actions. Per-chip conditional visibility.
Badges or counts layered on a chip. Any colour at all, including an opt-in tint — if that turns
out to be wanted, it is a change to §4 and deserves the argument, not a config key added
quietly.
