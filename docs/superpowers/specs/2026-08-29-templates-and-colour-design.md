# Templates and colour

Two capabilities the chips card has been asked for, and one material change that arrived with
them: Jinja templates in a chip's fields, a colour for its glyph, and a gradient scrim in place
of the flat one every glass pill draws today.

The three are separable and are kept separate on purpose. Templates are a **capability** and
belong in `core/`, because the calendar, battery, complication and weather cards will all want
them and none of them should grow a private copy. Colour is an **identity** decision and belongs
to the chips card alone, because it reverses something that card wrote down. The material is a
**look** shared by every glass surface in the library and is not configurable at all.

Written 2026-08-29, against the library as of `v1.7.0` (calendar, battery, complication,
weather, chips — the last of them now fully editable in the visual editor). Sibling to
[`2026-08-16-lock-screen-chips-design.md`](2026-08-16-lock-screen-chips-design.md), whose §4 and
§13 this document partly overturns; where the two disagree, this one is later and wins.

---

## 1. Why now, and what is not being built

The chips card exists to replace the chip rows on the HomeOS and HomeOS-2 dashboards. Those rows
are drawn today by cards that template, so a chip that cannot say
`{{ 'Home' if is_state('person.joe','home') else 'Out' }}` is not yet a replacement for one that
can, in exactly the sense §1 of the chips spec meant when it said a chip that cannot navigate is
not a replacement for one that can. That is the whole justification; nothing here is speculative
capability.

**Templating is built in `core/` and wired into the chips card only.** The other four cards
adopt it later, one at a time, with no redesign — the module is a subscription pool with a
`sync`/`read` pair and nothing card-shaped in it. Building it into five cards at once would be a
much larger surface for no earlier benefit, since chips are what is actually being replaced.

**A template-only chip is not being built.** A chip whose icon, text, colour and action all come
from templates and which names no entity at all — mushroom's `template-chip` — was considered and
declined for this release. It would make "a chip is an entity" stop being true, and three things
in the card currently depend on that: `watchedEntities()`, the editor's panel keys, and
`chipKeys`'s duplicate handling. It remains possible later; nothing below forecloses it.

## 2. The engine: `core/templates.ts`

Home Assistant renders a template over a websocket **subscription**, not a call. You subscribe
with the template string; Home Assistant pushes a first result and then a new one every time
anything the template touched changes. So this module is a subscription pool, and it is the only
file in the library that will speak `render_template` — the same one-file-per-protocol split
`calendar/source.ts` and `weather/source.ts` already make, for the reason `weather/source.ts`
states: a subscription's failure modes have nothing in common with a render's.

The surface:

```
isTemplate(value)      a string holding `{{` or `{%`
requestKey(request)    the dedupe identity: template plus variables
TemplatePool
  .sync(hass, wanted)  subscribe what is new, prune what is gone, keep the rest
  .read(key)           the last result, or undefined before the first push
  .disconnect()        on the card leaving the DOM
```

**`sync` prunes, and that is the point of it.** A pool that only ever subscribed would leak a
subscription every time a chip's template changed or a chip was deleted. This is not a
hypothetical: the weather card shipped with exactly that bug — an hourly forecast subscription
left running at a layout that no longer drew one — and it was found only because the pool was
audited. `sync` diffs the wanted set against the live set in both directions, and the test suite
asserts the prune, not just the subscribe.

**Templates are deduplicated by string plus variables.** Ten chips sharing one template cost one
subscription. Each chip's own id is passed as `variables: { config: { entity } }`, which is the
shape mushroom uses, so `{{ states(config.entity) }}` is a single template reusable across every
row rather than one template per row. Without the variables in the key, two chips using that
template would share one subscription and both read the first chip's answer.

**`hass` is an argument, never reached for.** `vitest.config.ts` runs in node, so a module that
reached for a global connection would be untestable in the only harness this repo has. This is
the same rule `core/actions.ts` follows and for the same reason.

**Errors warn and fall back.** The subscription is opened with `report_errors: true`; a template
that fails to render produces a `console.warn` naming the card and the template, and the field
reverts to its non-template answer — the entity's own name, its own icon, no colour. A throw here
would be an unhandled rejection inside somebody's dashboard rather than a message anybody sees,
which is the argument `core/actions.ts` already makes about a malformed tap action. There is no
toast mechanism in this library and this is not the place to add one.

## 3. What a chip gains

```yaml
type: custom:cupertino-plus-chips
color: blue # card-level: tints every glyph in the row
entities:
  - entity: sensor.hall # required, and NOT templatable
    name: '{{ … }}' # existed; may now be a template
    icon: '{{ … }}' # existed; may now be a template
    color: red | '#ff8800' | '{{ … }}' # new
    value: '{{ … }}' # new — replaces the printed reading
    show: '{{ … }}' # new — whether the chip is drawn at all
    tap_action:
      navigation_path: '{{ … }}' # may now be a template
      service: '{{ … }}' # may now be a template
```

**A string containing `{{` or `{%` is a template; anything else is a literal.** No `_template`
suffix keys, no `template:` block. This is what most modern custom cards do, so YAML copied from
one of them transfers, and it means a field does not have to be declared twice to be
occasionally dynamic. The cost is that a name genuinely containing `{{` is misread — vanishingly
rare, and it fails loudly rather than silently, because the render will error and the warn will
name the template.

**`entity` stays literal on purpose.** It is the row's identity. `watchedEntities()` is built
from it, the editor keys its panels by it, and `chipKeys` dedupes on it; a templated id would
make all three depend on an async result that does not exist on first paint.

**A `show` chip is hidden until its template answers, not shown.** A chip that flashes _in_ reads
as a dashboard loading, which every dashboard does. A chip that flashes _out_ reads as a bug. The
row reflows when it arrives and the card re-asks Home Assistant for its height, which §6 of the
chips spec already handles — the floor arithmetic is computed from the config, not from what is
currently drawn, so a hidden chip does not shrink the floor and make the card clip when it
returns.

**`value` replaces the reading, and nothing else.** It does not change the content mode, the
band, or the height: `layout.ts` prices a row from `content`, and a chip printing a longer string
wraps the row rather than growing it. That keeps §2's promise that every chip in a card draws at
the same height.

A `value` on a chip whose content mode is `icon` is **not an error and is not drawn** — that mode
prints no reading, so there is nothing for it to replace. It still reaches the accessible name,
which §7 of the chips spec defines as the chip's name and its reading, and which is the only
thing an icon-only chip says out loud. A `value` that renders empty falls back to the entity's own
formatted state rather than printing nothing, on the same grounds as every other field: a template
that has not answered yet and a template that answered with nothing are indistinguishable from
here, and a blank chip is the worse of the two readings.

**A hidden chip is still a watched entity.** `show` decides what is drawn, never what is
subscribed: its own template may depend on the chip's entity, and a chip that stopped watching
the thing that decides whether to show it could never come back. `watchedEntities()` is built
from the config, as it is today.

## 4. Colour: §4 of the chips spec, revisited

The chips spec argued that the card has no colour of its own — one ink for the whole row — and
that this is "the whole difference between a Lock Screen accessory and the Home Screen widget the
complication card draws". That argument is still right about what it was defending, and it is
being narrowed rather than thrown away.

**Colour paints the glyph. The reading, the caption and the pill stay one ink.** A row of six
chips still reads as one band; the colour is a category marker at the left of each pill rather
than six competing highlights. A coloured _number_ was rejected for the reason `core/ring.ts`
gives at length: a colour that moved with the value would be a second, blurrier opinion about a
number the chip has already printed.

**A chip's own `color` wins over the card's.** The card-level key is a default for the row, in
exactly the way card-level `content` is a default for every chip's content mode, and it resolves
the same way: the row's value, then the card's, then none. A card-level colour with no per-chip
colours anywhere is the ordinary way to tint a whole row one hue.

**Colour is opt-in, never automatic.** No `color:` means no colour, so every chips card on an
existing dashboard looks exactly as it does today after this ships. Automatic tinting from
`device_class` — what `tintFor` does for the complication card — was considered and declined:
it would repaint every existing dashboard on refresh, and it would turn the monochrome row from
the default into a thing you opt out of.

**Ten names, or any CSS colour.** The names are the palette `complication/tint.ts` already
carries — red, orange, yellow, green, teal, blue, indigo, purple, pink, accent — resolving to
`--cw-*` tokens that are already dark-mode correct. Anything else is passed through verbatim, so
`#ff8800` and `var(--my-token)` work. A second card wants the palette now, so `TINTS`,
`TintName` and the name-to-token resolver move to `core/tint.ts`; `tintFor`'s device-class
guessing stays in `complication/tint.ts`, since chips deliberately do not use it. That is the
move `moveRow` made a release ago, under the note that said where a helper belongs becomes a
question worth answering the day a second card wants one.

**A resolved colour reaches the DOM through `element.style.setProperty`, never through string
interpolation into a stylesheet.** The CSSOM validates and silently drops a value it cannot
parse, so a typo'd colour is a chip with no tint rather than a broken rule — and a config value
never becomes CSS text. This is a config the dashboard's owner wrote, so it is not an untrusted
input in the usual sense; it is still not a reason to build the interpolating version.

**An unavailable chip ignores its colour.** §9 of the chips spec dims a non-reporting chip to 55%
to say so. A chip that is greyed out _and_ bright orange is saying two things at once, and the
one that matters is the dimming.

## 5. The material: a gradient scrim

Independent of colour, and not configurable.

The glass pill's background is a flat `color-mix(in srgb, var(--cw-label) 14%, transparent)`
today. It becomes a soft vertical gradient — approximately 10% at the top, 18% at the bottom —
with a 1px lighter top edge for the specular line that both iOS glass and Material surfaces draw.

Two constraints it must respect. It sits **above** `backdrop-filter`, as a background layer on
the same element, so the blur still samples the wallpaper rather than the scrim; and it must stay
low-alpha for exactly that reason, since a dense scrim is a translucent card that has stopped
being translucent.

**Dark mode needs its own gradient, not the same one inverted.** The light still comes from
above, but the surface is dark: the top edge gets _brighter_ relative to the body and the body
gets _less_ dense, where the light-mode version gets denser downward. A single gradient flipped
would light the pill from underneath.

This applies to the chips card's glass pills. Whether the same treatment should reach
`container: card` and the other four cards' `ha-card` surfaces is left open — it is a change to
the shared card surface and deserves its own argument.

## 6. The editor

The per-chip panel shipped in v1.7.0 gains two things.

**A Colour row**, and a card-level one beside the existing card-level questions. A dropdown of
the ten names plus a `Custom…` entry that reveals a text field — the same conditional-field
pattern the tap action already uses, built from selectors `docs/ha-api-notes.md` records as
checked. HA's `ui_color` selector would draw this in one row and is very likely present; it is
not used, for the reason §8 gives.

**A per-chip "Use templates" switch.** This is the one genuinely awkward part of the design.
`icon` is an icon picker and `color` is a dropdown, and a template cannot be typed into either.
The switch swaps that chip's picker and dropdown for plain text boxes and reveals `value` and
`show`, which only make sense as templates.

It lives in the element's state, not in the config — it is a view of a row rather than a property
of one, so it writes no key, exactly as the open/closed state of each panel already does. It
defaults **on** for a chip whose config already holds a template in any field, so a config
written in YAML opens in the editor showing what it actually says rather than a picker that
cannot represent it.

## 7. Degradation

- **Before the first push** — every templated field falls back to its non-template answer, so a
  chip draws the entity's own name and icon and its formatted state. Nothing is ever blank while
  a template resolves. The exception is `show`, which hides (§3).
- **A template that errors** — a `console.warn` naming the card and the template, and the same
  fallback (§2).
- **A template returning something unusable** — a `color` that is neither a palette name nor a
  parseable CSS colour is dropped by the CSSOM (§4); an `icon` that is not an `mdi:` name draws
  as the missing-icon glyph, which is `ha-icon`'s own behaviour and not worth intercepting.
- **A subscription that never opens** — Home Assistant rejects the subscribe; warn once, fall
  back, do not retry in a loop.
- **`show` on every chip false** — the card draws `No Entities`, the same as a card with none
  configured. This is the honest answer: there is nothing to show.

## 8. Assumptions flagged for review

- **The `render_template` message shape.** The subscription is expected to take
  `{ type: 'render_template', template, variables, report_errors: true }` and to push
  `{ result, listeners }`, with errors arriving as `{ error, level }`. **Not verified here**:
  docker is not running on this machine, so a live frontend bundle cannot be grepped the way
  `calendar/source.ts`'s shape was proven. This is the same gap `weather/source.ts` carries in
  its own header today. Two things reduce the risk: `subscribeMessage`'s machinery is shared with
  the calendar's proven subscription, so only the literal keys of the outgoing message are the
  guess; and the Jinja half can be checked directly against a live installation over the MCP
  connection. The plan carries a verification step.
- **`report_errors`.** Assumed to be accepted and to deliver errors as messages rather than by
  rejecting the subscription. Fallback if not: drop the flag and treat a missing result as the
  error case.
- **HA's `ui_color` selector.** Assumed to exist; deliberately not used, so this is recorded
  rather than relied on. Same status as `ui_action` in the chips spec, which turned out not to be
  needed either.
- **`backdrop-filter` under a gradient background.** Expected to compose in the documented order
  — backdrop first, background layer over it. Universal in the versions Home Assistant targets,
  but unverified in HA's own stacking contexts until a screenshot exists.

## 9. Testing, and what cannot be tested

Under vitest, in node: `isTemplate`; `requestKey`'s dedupe including the variables; the
`sync` diff in both directions against a fake connection, with the **prune** asserted as its own
case; the error path's fallback; colour resolution for a palette name, a CSS colour and a value
that is neither; and `readChip` with template results applied, including the before-first-push
fallback and `show`.

What cannot be tested there: every element. The pool's integration with a card's lifecycle, the
gradient in light and dark, the tinted glyph against both containers, and the editor's template
switch are all verified by screenshot in the showcase, which is how the chips card's own visuals
were checked.

The showcase needs a `render_template` stub in `dev/mock-hass.ts`. It cannot run Jinja, so it
answers canned results keyed by template string, taken from the fixtures. That is enough to
screenshot the card and to drive the editor, and it is honest about being a stub in the way
`dev/ha-stubs.ts` already is about `ha-form`.

## 10. What this costs

Stated rather than buried.

- **Subscription count.** Eight chips with three templates each is up to twenty-four open
  subscriptions on one card. Deduplication collapses that sharply if templates are reused through
  `config.entity`, and not at all if every chip is bespoke. Mushroom has the same profile, so this
  is normal rather than novel, but it is a real cost of templating a whole dashboard.
- **The `{{` heuristic** misreads a literal containing `{{` (§3).
- **A second way to say the same thing.** `name: "{{ … }}"` and a plain `name:` now coexist, and
  a chip can end up with an icon set two ways over its life. That is the price of not adding
  `_template` keys, and it was judged the cheaper of the two.

## 11. Out of scope

- **A template-only chip** (§1).
- **Templates in the other four cards.** The engine is built to serve them; wiring is later work,
  one card at a time.
- **Automatic colour from device class** for chips (§4).
- **Per-chip pill fill, gradient or flat.** The material is uniform (§5); a tinted pill was
  considered and declined with the glyph-only decision.
- **The gradient on `container: card` and the other cards' surfaces** (§5) — possible, and its
  own argument.
- **`hold_action` and `double_tap_action`**, still, as in the chips spec.

## 12. Build order

1. `core/templates.ts` and its tests — the pool, with the prune proven.
2. `core/tint.ts` — the palette moved out of the complication card, both cards still green.
3. The chips model: template requests read off a config, results applied to a `ChipView`.
4. The chips card: `show`, the tinted glyph, and the pool's lifecycle.
5. The material gradient, light and dark, with screenshots.
6. The editor: the Colour row and the template switch.
7. Docs: the chips rules' §4 rewritten, a new section on templates, and
   `docs/ha-api-notes.md` gaining whatever the verification step actually establishes.
