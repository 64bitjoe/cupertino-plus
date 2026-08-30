# Chips widget: the rules

One card, one row, and a premise that is the complication card's turned inside out: a chip is
not a small widget, it is a mark on somebody else's wallpaper. Point it at some entities and it
draws one pill each — a glyph, usually a reading, optionally a caption — in a single ink, with a
tap action behind it. This is the specification the card implements; the code follows it module
by module, and `src/cards/chips/*.test.ts` pins the worked cases below.

Read [`complication-widget-rules.md`](complication-widget-rules.md) first. This card shares that
one's reading logic (`core/entity-view.ts` is the same module both cards resolve a name, an icon
and a formatted value through) and contradicts three of its rules on purpose, which is the
reason chips are a fifth card rather than a sixth complication style. Where this document says
"unlike a complication", that is the sentence being paid for.

---

## 1. What a chip is

```ts
{
  entityId: string | undefined, // identity, and what a tap acts on; undefined for §1a
  name: string,         // the caption in `labeled`, and the accessible name in every mode
  icon: string,         // an `mdi:` name, never a raw path; empty only for a spacer (§1a)
  value: string,        // formatted, unit included; an em dash for nothing to read
  content: ChipContent, // `icon` | `value` | `labeled`
  unavailable: boolean,
  color: string | undefined, // a resolved CSS value tinting the glyph, or the row's own ink
  visible: boolean,     // whether the chip is drawn at all
  spacer: boolean,      // an intentional gap; see §1a
  action: ActionConfig  // what a press does; see §7
}
```

`model.ts` is the whole of the card's contact with Home Assistant, the same split
`complication/model.ts` and `weather/model.ts` make: every render function downstream reads a
`ChipView` and knows nothing about entities. What is genuinely this card's own is short — the
content mode, the tap action, and the decision to draw an entity that is not there. Everything
else is `core/entity-view.ts`'s, and that matters more than it sounds: **a chip and a
complication must never disagree about what a thermostat's reading looks like.** Both print
`21.4°C`, tight, because one function decides it.

**An unreadable entity is never dropped.** A sensor that has gone `unavailable` becomes a
dashed, dimmed chip rather than a missing one, and an entity absent from `hass.states` entirely
— a typo'd id, an integration not yet loaded — gets the same treatment, named from the row or
from the id it asked for. That follows the complication card rather than the weather card, and
for its reason: a chip has a configured identity of its own to draw, where a weather card
without its entity has no location, no unit and nothing honest to put on the screen. It also
means a typo shows up as a chip you can see instead of a row that silently is not there.

### 1a. A chip without an entity

`entity` is the one field in a chip's config that is not required. A row with nothing else
configured either is a **spacer**: an intentional gap the width of one chip, drawn with no pill,
no glyph and no tap target — `aria-hidden`, not a divider mark, so a row of chips groups by
whitespace alone. Give the same row a `name`, an `icon` or a `value` — almost always a template,
since there is no entity for a literal to describe — and it stops being a spacer and becomes a
chip in its own right, built entirely out of what you wrote:

```yaml
entities:
  - entity: sensor.hall_temperature

  - {} # a blank spacer

  - icon: "{{ 'mdi:weather-night' }}"
    name: Goodnight
    tap_action:
      action: call-service
      service: script.goodnight
```

This is not the same failure as an unreadable entity in §1 above. That treatment — dashed,
dimmed — says "this was configured and cannot be read"; a spacer or a templated chip was never
configured to read one, so it draws at full opacity and defaults its press to doing **nothing**
rather than opening a more-info dialog for an entity that does not exist. An explicit
`tap_action` — most usefully one carrying its own `entity` override, so an entity-less chip can
still toggle or show more-info for something specific — is honoured exactly as it would be on
any other chip.

The editor's **Add a blank chip** button creates one directly, opened straight into its
per-chip **Use templates** mode. Clearing a chip's Entity field does the same thing to an
existing row — it does not delete it, the way it used to; the trash icon is the only thing that
does now.

## 2. The three content modes, and the band

Set per card, overridable per chip.

| Mode      | Draws                                                             |
| --------- | ----------------------------------------------------------------- |
| `icon`    | The glyph alone                                                   |
| `value`   | Glyph and reading — **the default**                               |
| `labeled` | Glyph, a small uppercase caption, and the reading stacked beneath |

A `labeled` chip is two lines tall where the other two are one, and a row mixing them freely
would be a ragged band of different heights. So: **the tallest mode present sets the height every
chip in that card draws at.** One `labeled` chip promotes the whole row's height rather than
standing a head above its neighbours — the same instinct as the battery card refusing to draw a
full row of rings with a stub beneath it.

**Height is card-wide; content is per chip.** These were the same thing until v1.10.0, and
conflating them was a bug rather than a simplification: `bandFor` picked one mode and
`_renderChip` drew _every_ chip in it, so a `content: icon` chip sitting beside a `value` one
was not icon-only at all — it drew the reading too, and there was no way to have a bare glyph in
mixed company. Worse, a chip whose value was empty still got an empty `<span class="value">`,
which is a flex item, so the pill reserved a text-sized gap after the glyph for text that was
never there.

Now the band decides only `--cw-chip-row`, the height every pill shares, and each chip draws
what its own `content` says inside it. An icon-only chip in a labeled row is a full-height pill
containing one glyph: aligned with its neighbours, the band intact, showing exactly what was
asked for. An empty reading draws no element at all rather than an empty one.

The caption in `labeled` is the chip's name: the entity's `friendly_name` unless a per-chip
`name` overrides it, the same resolution every other card gets. The other two modes carry that
name in the accessible name and the tooltip only, never on screen.

### 2a. Saying which chips share a row

By default the row wraps where the dashboard's width says it must, and that is usually the right
answer. `break: true` on a chip overrides it: **that chip starts a new row.**

```yaml
entities:
  - entity: sensor.wifi
  - entity: sensor.unavailable # flows beside it

  - entity: sensor.temperature
    break: true # starts row 2
  - entity: sensor.energy # flows beside it
```

Three rules worth stating, because each is a decision rather than a consequence:

- **A break says where a row starts, not that it fits.** A forced row too wide for the dashboard
  still wraps onto extra lines rather than clipping — §6's promise is not something `break` is
  allowed to take away, and the floor arithmetic prices each row's own wrapping so the card asks
  for the height it actually needs.
- **A break on the first chip is ignored.** Every chip starts a row when it is the first one, so
  the flag says nothing there, and honouring it would draw a leading empty row — 44 units of
  unexplained gap. Reachable by dragging a chip that carries the flag to the top, so it is a
  case the code handles rather than a case that cannot happen. The editor hides the switch on
  the first chip for the same reason.
- **It is not templatable.** Where a row begins is a layout fact the floor needs before `hass`
  exists; a value arriving asynchronously would change the card's height a tick after it was
  measured.

The card renders one flex container per row rather than the usual zero-height full-width spacer
trick, which would be a flex item of its own and so collect the container's gap on both sides —
every forced row sitting 8 units further from its neighbour than an organic wrap does. A config
with no `break` anywhere produces exactly one container holding everything, which is the same
DOM this drew before rows existed.

## 3. The colour: this card opts out of identity

The complication card's §2 says the colour comes from what the entity measures and then holds
still — orange for a thermometer at 40°F and at 90°F, because the colour is "what kind of thing
is this" rather than "how is this reading doing". **Chips have no per-entity colour at all**,
and that is a departure rather than an omission.

The reason is the idiom. A Lock Screen accessory is rendered in one vibrant ink over the
wallpaper, and the whole point of the row is that it reads as one quiet band. Eight tinted pills
is eight competing dots: the same failure the complication card's §2 warns about when it refuses
to let colour track a value, arriving by a different route. A row of chips is a sentence, not a
chart.

One ink, `--cw-label`, and a scrim mixed from the same token. Deliberately not a forced white:
`--cw-label` is near-white on a dark theme and near-black on a light one, which is exactly the
behaviour wanted here and exactly the behaviour the complication card's painted tints had to
avoid (its §4, and its fixed near-black `--cw-comp-on-tint`). Nothing in this card paints a
surface the theme did not choose, so nothing in it needs a contrast table.

## 4. The two containers

`container: 'glass' | 'card'`, defaulting to `glass`.

**`glass`** — `ha-card` draws no surface, no border and no shadow, and each pill carries a
translucent scrim plus `backdrop-filter: blur(24px) saturate(180%)`. The pills float directly on
the view. This is the Lock Screen reading and the reason the card exists.

The mechanism constrains the implementation, so it is stated rather than assumed:
`backdrop-filter` samples whatever is painted behind the element, so the blur does anything at
all only if the card is transparent the whole way down. Every other card in this library paints
a surface. This is the first one that must not.

It was also the design's third unverified assumption — whether a `backdrop-filter` inside the
card's shadow DOM would reach the dashboard behind `ha-card` — and it is now checked rather than
hoped: photographed over a hard-striped background, the stripes come out smeared to a flat grey
inside every pill and sharp everywhere else. The blur is real, through the shadow root, in the
Chromium that Home Assistant's own frontend targets.

**Two traps the same mechanism sets**, both found by looking at pictures rather than at code:

- **An ancestor with `opacity` below 1 is a backdrop root**, and the pill inside it then has
  nothing to sample. The library's shared press effect (`.cw-pressable:active` in
  `theme/base-styles.ts`) sets `opacity: 0.8` on the pressed element, which for a chip is the
  box _around_ the pill — so the glass went flat for exactly as long as a finger was down, on
  the one card whose whole point is the blur. The card overrides it: the chip keeps the
  `transform: scale(0.97)`, which is harmless (a transformed ancestor is not a backdrop root),
  and hands the opacity down to the pill itself, where it dims the blur instead of killing it.
- **A surface under a blur is a surface being blurred.** `container: 'card'` therefore drops the
  `backdrop-filter` entirely and puts the pills on a flat `--cw-track` scrim: blurring against
  an opaque card samples the card and achieves nothing but cost.

### The contrast limitation, stated rather than solved

Over a photographic wallpaper, no theme can know what sits behind any given pill. A light theme
over a dark photo will fight; so will the reverse. There is no runtime mechanism in this
codebase for sampling a background image, and inventing one for a chip row is not proportionate
— the striped test above is also a picture of this problem, with near-black text on a mid-grey
pill over a background that is half white.

So the limitation is disclosed, and **`container: 'card'` is the answer to it**: an opaque
surface underneath restores a known background, at the cost of the effect. This is the same
shape of disclosure the complication card makes about `accent`, whose contrast cannot be checked
at build time either.

## 5. How tall a row is allowed to get

Every length below is a design unit: pixels at `scale: 1`.

| Band            | Row height | Why                                                     |
| --------------- | ---------- | ------------------------------------------------------- |
| `icon`, `value` | 44         | The touch target, not the paint — see §6                |
| `labeled`       | 48         | Caption (11) over reading (17), plus the pill's padding |

`layout.ts` is deliberately small next to the other cards' layout modules, because this card
gives most of the job away: chips are content-width and CSS `flex-wrap` decides which of them
lands on which line, against text metrics no module running in node can see. Guessing at those
and then rendering with `flex-wrap` anyway would produce two answers that disagree, and the one
the user sees would be the CSS.

What cannot be given away is the floor. `getGridOptions()` is answered before anything is
measured, and if it under-reports, Home Assistant hands the card a box too short for its content
and `ha-card` clips the overflow. So the floor is priced against a nominal chip width per band
(52, 96, 128) and errs generous, and it is priced **at three chips across** — the narrowest a
multi-chip card can be dragged, which is also `min_columns`. That number is the whole of the
guarantee: price the height against a wide card and a user who drags it narrow gets more lines
than the floor allowed; price it against a one-chip width and a twelve-chip card arrives ten
rows tall, because `withFloors` raises the default rows to the floor. Three makes the floors
reachable and the clipping unreachable at the same time.

**The floor is priced against what is actually visible, not against every configured row.** A
chip hidden by its own `show` (§7) takes no room, which is what stops a card built mostly of
chips that are usually hidden from reserving space for all of them anyway. But `getGridOptions()`
can be asked before any `show` template has had its first result — every one of them reads as
hidden until it answers — so the very first answer is usually too small, not too large.
`chips-card.ts` tracks the highest floor the card has actually needed rather than the current
one: the box shrinks to fit within the first render or two, once real visibility is known, and
then holds there — growing again if more chips turn out visible later, never shrinking back
below what has already been shown. A genuine config edit (a chip added or removed, the card's
content default changed) resets that high-water mark rather than carrying it forward.

## 6. Never scrolls, never truncates the list

The complication card's §5 and §6 apply here word for word, and are not restated: what a box too
small to hold every chip produces is not a hidden chip, it is a taller card. There is no
`+2 more`, no scroller, and no truncated state anywhere in this card.

Inside one chip is the single exception, and it is truncation of a string rather than of the
list: a reading or a caption longer than 140 units ellipsises, so one verbose sensor cannot eat
an entire line. The chip is still there, still the same height, still tappable.

**The touch target is 44 units in both directions.** The visible pill is about 30 tall and, for
an icon-only chip, 43 wide (13 + 17 + 13) — both under Apple's floor for something a press can
now toggle a light with. So the pill is drawn inside a taller, and if necessary wider, pressable
box: the affordance stays small, the target does not. The width half of that is not theoretical
tidiness; `docs/images/chips-icons.png` measured 43 before it was added.

## 7. What a press does

The config is Home Assistant's own, deliberately: YAML already written against other custom
chip cards transfers unchanged, and so does the muscle memory of whoever wrote it. Five actions,
`more-info` by default for a chip with an entity — **`none` for a chip without one** (§1a),
since opening a more-info dialog for an entity that does not exist is not a sensible default to
fall back to — and `core/actions.ts` is a dispatch table taking
`(hass, element, config, entityId)` — collaborators as arguments rather than globals, which is
what makes it testable in the node environment this suite actually runs in. `entityId` may
itself be `undefined` for the same reason; `toggle` and `more-info` both warn and do nothing
rather than calling Home Assistant with no target, unless an explicit `tap_action.entity`
supplies one.

In the editor, **Go to a view** is Home Assistant's own view picker — a searchable list of the
installation's actual dashboards — rather than a path typed by hand, outside the per-chip
**Use templates** mode; a template cannot be typed into a picker, so that mode keeps the plain
text field instead.

| `action`       | Behaviour                                              |
| -------------- | ------------------------------------------------------ |
| `more-info`    | Fires `hass-more-info` — **the default**               |
| `toggle`       | `homeassistant.toggle` against the chip's entity       |
| `navigate`     | `cwNavigate` with `navigation_path`                    |
| `call-service` | `hass.callService` with `service`, `data` and `target` |
| `none`         | Nothing, and no pressable affordance is drawn          |

```yaml
type: custom:cupertino-plus-chips
entities:
  # No tap_action at all: more-info, which is what a chip does when nobody says otherwise.
  - sensor.hall_temperature

  - entity: light.kitchen
    tap_action:
      action: toggle

  - entity: person.joe
    tap_action:
      action: navigate
      navigation_path: /lovelace/people

  - entity: sensor.hall_temperature
    tap_action:
      action: more-info

  - entity: binary_sensor.kettle
    tap_action:
      action: call-service
      service: switch.turn_on
      # Passed verbatim. A `target` you wrote is the target, never the chip's own entity.
      target:
        entity_id: switch.kettle
      data:
        transition: 2

  - entity: sensor.shed_temperature
    tap_action:
      action: none
```

Three rules that are easy to miss and cost a bug each:

- **A chip with `action: none` is not a button.** No `role`, no tab stop, no pressed state. An
  affordance that lies about being interactive is worse than none, and eight of them in a
  keyboard user's tab order is the concrete version of that.
- **A malformed action warns and does nothing.** `{ action: navigate }` with no path, or a
  `call-service` whose `service` is not `domain.service`, is a thing a hand-written config
  will produce; it names itself in the console rather than throwing inside a click handler,
  where an exception is an unhandled rejection in somebody's dashboard instead of a message
  anybody sees. There is no toast mechanism in this library and this card does not add one.
- **`entity` inside a `tap_action` overrides what the action applies to**, for the chip that
  shows one thing and acts on another. Rarely wanted; honoured where it is.

Enter and Space activate, matching every other card here. The accessible name is the chip's name
and its reading — `Hall, 21.4°C` — never the glyph.

`hold_action`, `double_tap_action`, `url` and `assist` are out of scope. All four are additive
to this same config shape; none of them changes anything above if they arrive later.

## 8. Degradation

- **Entity missing from `hass.states`** — the chip still draws, dashed, from its configured
  identity (§1).
- **`unavailable` / `unknown`** — dashed and dimmed, the library's existing contract: the
  reading becomes an em dash and the pill drops to 55% opacity.
- **A `toggle` or `call-service` that fails** — a `console.warn` naming the service, and nothing
  else (§7).
- **`navigate` to a path that does not exist** — Home Assistant's own problem to report; the
  card has already handed off.
- **No entities configured at all** — `No Entities`, centred, rather than an empty card. A
  freshly dropped chips card from the picker is exactly this, and it should say so.

## 9. Still open

Decided rather than known, each one edit away from being decided differently.

- **What the editor draws it with.** `name`, `icon`, `content` and `tap_action` are all
  reachable from the visual editor: `chip-list-editor.ts` is a sortable list of
  `ha-expansion-panel`s, one per chip, on the model the battery card set. They were YAML-only
  in v1.6.0, deferred on the grounds that a per-chip form needed two frontend APIs that could
  not be checked here. It needs neither. `ha-form`'s `expandable` node is not used, because a
  panel this card owns is one it can hang a drag handle and a delete button off, and nothing in
  `ha-form` can do that. Home Assistant's `ui_action` selector is not used either, and that one
  is a live trade: it would draw the whole tap-action control in a single row, it is very
  likely present in the 2026.7 frontend this card requires, and "very likely" is what got the
  per-chip form deferred once already. Instead the action is spread across a `select` and one
  conditional `text` field, all of them selectors `docs/ha-api-notes.md` records as checked.
  Swapping `ui_action` in later touches that one file: the config shape is Home Assistant's
  either way.
- **Three tap-action keys stay in YAML**, on purpose rather than pending: a `call-service`'s
  `data` and `target`, and the `entity` override (§7). They are structured values a text field
  cannot honestly ask for, and each is rare enough that a form row for it would cost every user
  a field to skip. `chipFromForm` carries all three through untouched, so a chip that has them
  can still have its name edited in the dialog without losing them.
- **A config may name the same entity twice**, and the card draws both chips. The editor
  renders both and refuses to _add_ a duplicate: its rows are keyed by entity id, so the second
  occurrence is keyed positionally (`chipKeys`) and a drag past its twin closes both panels.
  The second chip is writable in YAML and fully editable once it is there. The same positional
  keying now also covers a chip with no entity at all (§1a).
- **Per-chip colour is implemented** — a palette name or any CSS colour, tinting the glyph only
  and only when asked — which supersedes this section's earlier "out of scope on purpose"
  answer. So are Jinja templates in most of a chip's fields, via a `core/templates.ts`
  subscription pool shared with the rest of the library. Neither is written up in this document
  yet; that is a known gap, not a decision, and the design rationale lives for now only in
  `docs/superpowers/specs/2026-08-29-templates-and-colour-design.md`.
- **Whether the gradient scrim (the material behind the glass pill) should reach
  `container: card` and the other four cards' own surfaces.** Deliberately left for its own
  argument rather than decided here.
