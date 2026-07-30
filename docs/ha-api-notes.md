# Home Assistant API notes

Facts verified by reading the frontend bundle and core source **inside** the
`ghcr.io/home-assistant/home-assistant:stable` image, and by running probe builds --
not from documentation or tutorials, several of which are out of date on these points.

Re-check with:

```bash
docker run --rm --entrypoint bash ghcr.io/home-assistant/home-assistant:stable -c \
  'grep -roh -- "PATTERN" /usr/local/lib/python3.*/site-packages/hass_frontend/frontend_latest/*.js | head'
```

---

Image: `ghcr.io/home-assistant/home-assistant:stable` = **HA core 2026.7.4**,
frontend package **20260624.6**. Bundle: `hass_frontend/frontend_latest/*.js` (minified).
A `frontend_es5/` build still ships, but custom cards only need the modern one.

## Sizing / grid (VERIFIED, not from docs)

`hui-card` (the wrapper HA puts around every card) does:

```js
getCardSize() { return this._element ? computeCardSize(this._element) : 1 }

getGridOptions() {
  return { ...this.getElementGridOptions(), ...this.getConfigGridOptions() }
}

getElementGridOptions() {
  if (!this._element) return {}
  if (this._element.getGridOptions) return this._element.getGridOptions() || {}
  if (this._element.getLayoutOptions) return migrate(this._element.getLayoutOptions())
  return {}
}

getConfigGridOptions() {
  return this.config?.grid_options
    ? this.config.grid_options
    : this.config?.layout_options ? migrate(this.config.layout_options) : {}
}
```

Consequences that drive our architecture:

1. `getGridOptions()` is THE current API. `getLayoutOptions()` exists only as a
   back-compat branch — we implement `getGridOptions()` only.
2. **User config wins.** `config.grid_options` is spread _after_ ours, so whatever
   the user drags in the sections UI overrides our returned columns/rows.
   => the card must render from its ACTUAL measured box, never from anything it asked
   for. `getGridOptions()` only supplies a good _default_ + min/max clamps.
3. `getCardSize()` is still used for the legacy masonry layout — ship both.

Grid is **12 columns**. Confirmed by real cards in the bundle:

- `history-graph`: `getGridOptions(){return{columns:12,min_columns:6,min_rows:2}}`
- a strategy generating `grid_options:{columns:12}` (full width) and `{columns:6}` (half)

The Layout tab clamps its own sliders to the floors we return, and to nothing else:

```js
// hui-card-layout-editor
html`<ha-grid-size-picker
  .rowMin=${i.min_rows}
  .rowMax=${i.max_rows}
  .columnMin=${i.min_columns}
  .columnMax=${i.max_columns}
  …
></ha-grid-size-picker>`
// ha-grid-size-picker
const a = this.rowMin ?? 1,
  n = this.rowMax ?? this.rows // a is the rows slider's floor
```

So `min_rows` is a promise the card makes rather than a hint it offers: the user can drag
to exactly that height, and the frontend does nothing else about it — in particular it
knows nothing of the `min-height` a card keeps on its own `ha-card`, and CSS applies
`min-height` after `max-height`, so a floor taller than the cell hangs the card over its
neighbour instead of being clamped. => whatever we name in `min_rows`, the card has to be
able to draw itself in. See `core/base-card.ts`.

`rows: "auto"` IS supported. Real card in the bundle:

```js
getGridOptions() {
  return { columns: 6, rows: this.preview ? "auto" : 1, min_rows: 1, min_columns: 6 }
}
```

Note `this.preview` — **HA sets a `preview` property on the card element.** The name is
misleading and the mistake it invites is expensive, so: it means **the user is editing**,
not "this card is a thumbnail". From the sections view:

```js
// hui-view / hui-section
_createCardElement(config) {
  const el = document.createElement('hui-card')
  el.hass = this.hass
  el.preview = this.lovelace.editMode // <-- edit mode, for EVERY card on the board
  el.layout = 'grid'
  el.config = config
  ...
}
// and on the section itself:
html`<hui-section .config=${s} .hass=${this.hass} .preview=${this.lovelace.editMode} …>`
```

So it flips to `true` for the whole dashboard the moment the pencil is pressed, and
wrapper cards forward it down (`this._element.preview = this.preview`). What HA's own
cards do with it:

- size differently while editing — `rows: this.preview ? "auto" : 1`;
- stay visible when they would otherwise hide — `hui-conditional-card` does
  `setVisibility(visible) { const show = this.preview || visible; … }`.

What no card does with it is **draw something other than the real thing**. A card that
showed sample data on `preview` would swap the entire dashboard's contents for samples as
soon as the user went to edit it — see `_fixtures` in `calendar-card.ts`, which is where
this library got it wrong once.

Not to be confused with `window.customCards[].preview`, which is a different flag with a
similar name: that one really is picker-only, and asks the picker to render a live card
instead of a grey tile.

## Calendar data (VERIFIED — contradicts most tutorials)

HA's own frontend does **not** use the REST endpoint `/api/calendars/<entity>?start=&end=`
anywhere in the bundle. It uses a websocket **subscription**:

```js
hass.connection.subscribeMessage(callback, {
  type: 'calendar/event/subscribe',
  entity_id: entityId,
  start: startDate.toISOString(),
  end: endDate.toISOString(),
})
```

Mutations:

```js
hass.callWS({ type: 'calendar/event/create', entity_id, event })
hass.callWS({
  type: 'calendar/event/update',
  entity_id,
  uid,
  event,
  recurrence_id,
  recurrence_range,
})
hass.callWS({ type: 'calendar/event/delete', entity_id, uid, recurrence_id, recurrence_range })
```

A subscription means push updates — no polling loop needed. Big UX win for a widget.

### The subscribe REQUEST is strict, and takes ONE entity

```python
# components/calendar/__init__.py — handle_calendar_event_subscribe
@websocket_api.websocket_command(
    {
        vol.Required("type"): "calendar/event/subscribe",
        vol.Required("entity_id"): cv.entity_domain(DOMAIN),
        vol.Required("start"): cv.datetime,
        vol.Required("end"): cv.datetime,
    }
)
```

- Four keys, and the schema is `vol.PREVENT_EXTRA`: a fifth is rejected with
  `invalid_format`. There are no optional keys.
- `cv.entity_domain` wraps `cv.entities_domain` and then demands exactly one, so **a list
  of two is refused** — _"Expected exactly 1 entity, got 2"_. A one-element list is
  accepted and coerced to the bare string. So N calendars means N subscriptions, which is
  what the frontend does (`hui-calendar-card` keys `_unsubs` by entity id).
- `start >= end` is refused in the handler with `invalid_format`, _"Start must be before
  end"_. There is **no cap on the window size** — a 100-year span passes.
- A non-existent entity is `not_found`; in JS that **rejects the `subscribeMessage`
  promise** with the raw `{code, message}`. An entity that merely went `unavailable` does
  NOT reject: `get_entity` is a state-independent dict lookup.

### The PUSH payload (verified — this is the part no tutorial gets right)

```python
connection.send_message(websocket_api.event_message(subscription_id, {"events": events}))
```

`subscribeMessage`'s callback receives the `event` value, so what a card sees is:

```ts
{ events: CalendarEventPayload[] | null }
```

- An **object with one key**, not a bare list.
- `events: null` is how a **failed fetch** arrives — on the same subscription, not as an
  error frame. `_async_update_listener` catches `HomeAssistantError` and calls
  `listener(None)`. HA's own card tests `msg.events === null` and shows
  `ui.components.calendar.event_retrieval_error`. `msg.events.map(…)` is a crash.
- Every push is a **full snapshot** of that calendar's window, never a delta. HA's card
  drops all prior events for the calendar and re-appends.
- The result ack is sent **before** the first snapshot (the fetch is wrapped in
  `hass.async_create_task`), so there is nothing to await for data.
- Events are **not clipped** to the window — a platform returns anything _overlapping_ it,
  so a returned `start` may precede the requested one. Clipping is the client's job.
- Re-push is debounced 1 s and fires on every state write; with `SCAN_INTERVAL = 60` and
  `should_poll` defaulting true, that is roughly once a minute, plus each event boundary.
  Turning off "Enable polling for updates" on the config entry removes the heartbeat.

One event is `CalendarEvent.as_dict()`:

```python
def _event_dict_factory(obj):          # note: value.isoformat(), NOT as_local
    result = {}
    for name, value in obj:
        if isinstance(value, (datetime.datetime, datetime.date)):
            result[name] = value.isoformat()
        elif value is not None:
            result[name] = str(value)
    return result
```

```jsonc
// timed
{"start":"2026-07-26T09:30:00+02:00","end":"2026-07-26T10:30:00+02:00","summary":"Standup","uid":"a1","all_day":false}
// all-day — bare dates, and `end` is EXCLUSIVE
{"start":"2026-07-27","end":"2026-07-29","summary":"Trip","all_day":true}
```

- `start`, `end`, `summary`, `all_day` are always there. `description`, `location`, `uid`,
  `recurrence_id`, `rrule` are **omitted entirely** when unset — absent, not `null`.
- `start` / `end` are **plain ISO strings**. The nested `{"dateTime": …}` / `{"date": …}`
  form is the REST endpoint's (`_api_event_dict_factory`), and the frontend never calls it
  — `grep -c "api/calendars" frontend_latest/*.js` is 0. Do not write one parser for both.
- All-day is a date-only `start` **and** `all_day: true`, the same fact twice.
  Interestingly the frontend reads neither flag: it hands the raw string to FullCalendar,
  which infers all-day from the absence of a time portion.
- **`end` is exclusive for all-day.** `strings.json` says so ("The date the all-day event
  should end (exclusive)") and `CalendarEvent.__post_init__` rewrites a same-day all-day
  event to end the next day. The frontend's event editor proves it from the other side:
  it reads `addDays(new Date(dtend + "T00:00:00"), -1)` and writes `addDays(dtend, 1)`.
- The offset is **not normalised** — `isoformat()` emits whatever the integration built.
  `demo` and `local_calendar` carry the HA local offset; a UTC-based integration sends
  `+00:00`. So a card must not assume the offset matches `hass.config.time_zone`.
  Naive datetimes cannot occur (`CALENDAR_EVENT_SCHEMA` rejects them).

### Per-calendar colour is NOT on `hass.entities`

`hass.entities` is the DISPLAY registry, decoded in `connection-mixin.ts` from
`config/entity_registry/list_for_display` into exactly twelve fields — `entity_id`,
`device_id`, `area_id`, `labels`, `translation_key`, `platform`, `entity_category`,
`has_entity_name`, `name`, `icon`, `hidden`, `display_precision`. **No `options`.** So the
zero-config helper sketched above cannot get the colour from `hass`; its third argument is
the full registry, which HA's panel and card both subscribe to separately.

The full registry is `config/entity_registry/list` (a flat array) — but there is a scoped
alternative, which is what this library uses:

```ts
hass.callWS({ type: 'config/entity_registry/get_entries', entity_ids: [...] })
// -> { [entity_id]: entry | null }    entry.options.calendar.color
```

Neither is admin-gated; only `update` and `remove` carry `@require_admin`. `null` comes
back for an entity with no registry entry at all — which every `demo` and YAML calendar
is, since they have no unique id, so those can never have a colour set.

`options.calendar.color` is a plain string two levels deep. It is a **named token** when
the colour picker wrote it (its options are `Array.from(THEME_COLORS)`, 25 of them), and a
`#RRGGBB` when an integration seeded it — `CalendarEntity.get_initial_entity_options()`
validates `initial_color` through `cv.color_hex`, and `google` is the one integration that
sets it. `computeCssColor` turns a token into the string `var(--<token>-color)` and passes
anything else through.

`isValidColor` is broader than it looks — three accept paths, and the last one needs a DOM:

```js
if (THEME_COLORS.has(v)) return true
if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(v)) return true
try {
  const s = new Option().style
  s.color = v
  return s.color !== ''
} catch {
  return false
}
```

Note the three text tokens (`primary-text`, `secondary-text`, `disabled`) are mapped by
`computeCssVariable` but **rejected** by this, so a calendar carrying one falls through to
the index palette.

The fallback palette is not hex in JS — `getColorByIndex(index, style)` is
`style.getPropertyValue(\`--color-${index % 54 + 1}\`)`, reading 54 custom properties
defined once in `color.globals.ts`'s `html {}`block, with no dark override.`--color-54`duplicates`--color-1`, so it is 53 distinct colours. `--graph-color-N`is
never defined by the shipped theme, so`getGraphColorByIndex` always falls through.

### Zero-config calendar discovery + colors — HA's own helper, deminified

```js
;(hass, styleTargetEl, entityOptionsList) => {
  const computed = getComputedStyle(styleTargetEl)
  const optionsByEntity = new Map(entityOptionsList?.map(e => [e.entity_id, e.options]) ?? [])
  return Object.keys(hass.states)
    .filter(
      id =>
        computeDomain(id) === 'calendar' &&
        hass.states[id].state !== UNAVAILABLE &&
        hass.entities[id]?.hidden !== true,
    )
    .sort()
    .map((id, index) => {
      const stateObj = hass.states[id]
      const configured = optionsByEntity.get(id)?.calendar?.color
      const color =
        configured && isValidColor(configured)
          ? resolveColor(configured)
          : fallbackColorByIndex(index, computed)
      return { ...stateObj, name: computeStateName(stateObj), backgroundColor: color }
    })
}
```

Exactly the zero-config default we want: enumerate `calendar.*`, skip unavailable and
registry-hidden entities, honour the user's per-calendar colour from the entity registry,
else assign from a palette by index. Also confirms `hass.entities` (entity registry) is
available to custom cards.

## Visual editors (VERIFIED — and the received wisdom here is stale)

A card gets a visual editor by answering `static getConfigElement()`. Without one,
Home Assistant shows `ui.errors.config.visual_editor_not_supported` — _"Visual editor
not supported"_ — and a raw YAML box.

That costs more than the fields. `hui-card-element-editor` renders its tab strip inside
`renderConfigElement()`, which `hui-element-editor` only calls in the **GUI branch**; no
config element means `GUImode` is forced false, so the user also loses the
**Visibility** and **Layout** tabs, which are otherwise rendered by the host and have
nothing to do with our card:

```js
// hui-card-element-editor
const tabs = ['config']
if (this.showVisibilityTab) tabs.push('visibility')
if (this._showLayoutTab) tabs.push('layout')
if (tabs.length === 1) return super.renderConfigElement() // no tab bar
```

`_showLayoutTab` additionally needs a `sectionConfig`, which only `hui-section` passes —
so the Layout tab exists in the sections layout and not in masonry or panel views.

This is what killed our own `size` preset, so it is worth following through. The
temptation is to read the missing tab as "so a `size` option is the sizing control in the
other views". It is not a control there at all. `getGridOptions()` has exactly three call
sites in the whole bundle — `hui-view-footer`, `hui-section`, and
`hui-card.getElementGridOptions()`, which only those two consume — so `columns` is never
read outside the sections grid. Masonry asks a card only for `computeCardSize()`, and uses
the answer to pick the shortest column rather than to size anything; panel view asks for
nothing and sizes with CSS. Our footprint is `rows: 4`, so `getCardSize()` is 5 and the
fallback height is 248px, and the rendered layout comes from the measured width — the
masonry column's.

So a `size` config key could only ever have done two things, both of them in the one view
that already has the Layout tab: set the footprint the card arrives with, and set the
`min_columns` clamp on how far it can be dragged. Neither is worth a control, because the
tab does the first better (any footprint, dragged, live) and wins outright over it
anyway — `config.grid_options` is spread after ours. A card that renders from its measured
box needs one default footprint and a floor, not a menu. See `core/size.ts`.

### The contract for the element

Read out of `hui-element-editor`, not out of documentation:

```js
// loadConfigElement — runs once; only a change of config.type replaces the element
const el = await elClass.getConfigElement()      // static, awaited, may return a promise
el.hass = this.hass                              // hass FIRST
if ('lovelace' in el) el.lovelace = this.lovelace
el.context = this.context
el.addEventListener('config-changed', ev => this._handleUIConfigChanged(ev))
// _updateConfigElement — then, and again on EVERY later change, including our own
el.setConfig(this.value)

_handleUIConfigChanged(ev) {
  ev.stopPropagation()
  if (!this.GUImode) return
  const config = ev.detail.config
  Object.keys(config).forEach(k => config[k] === undefined && delete config[k])
  this.value = config
}
```

Consequences:

1. `config-changed` carries the **whole** config in `detail.config`. Note _where_ the
   listener goes: on the config element itself, so the handler runs at the target and
   neither `bubbles` nor `composed` is actually required. Set them anyway — HA's own
   `fireEvent` does, and it costs nothing to survive a host that listens further up.
2. Only `undefined` values are stripped. An `entities: []` lands in the user's YAML —
   hence `applyFormData` in `core/card-editor.ts`.
3. Throwing out of `setConfig` is the supported way to say "I cannot edit this": the
   host wraps it in a `GUISupportError`, shows the message as a warning, and drops to
   YAML. A plain `Error` is a warning; only a superstruct `StructError` (or a failure to
   resolve the element) is the red _Configuration error_.
4. Custom types resolve through `customElements.whenDefined(tag)` with a hard **2000 ms**
   timeout, after which the editor shows `Custom element not found: <tag>`.
5. `GUImode-changed` is fired **by** the host, not by us. A config element never needs it.

There is a second path — `static getConfigForm()` returning `{schema, assertConfig,
computeLabel, computeHelper}`, which HA renders with its own `hui-form-editor`. We do
not use it: its schema cannot depend on the config, and it writes the form value into
the config verbatim, empty arrays and all.

### `ha-form` is already loaded — no `loadCardHelpers` dance needed

The widely-copied trick of calling `window.loadCardHelpers()` and forcing a built-in
card's editor open, just to get `ha-form` defined, is not needed on 2026.7. `ha-form`
(module 55682) and `ha-selector` (module 45118) both ride in chunk **85407**, and that
chunk is in the `lovelace` panel's own initial group:

```js
lovelace: () => Promise.all([e(4801), ..., e(85407), ...])
```

So by the time any card editor renders, both are defined. Worth re-checking on a bump —
the edit-card dialog itself (`[45776, 70808, 28451]`) does **not** carry them, and
neither does HA's own calendar-card-editor chunk, so the panel group is the only thing
holding this up:

```bash
# -i is required: without it docker does not forward the heredoc to python's stdin.
docker exec -i cupertino-widgets-ha python3 - <<'PY'
import re, glob, os
D = "/usr/local/lib/python3.14/site-packages/hass_frontend/frontend_latest"
files = [p for p in glob.glob(D + "/*.js") if not p.endswith((".map", ".br", ".gz"))]
app = next(p for p in files if os.path.basename(p).startswith("app."))
group = re.search(r"lovelace:\(\)=>Promise\.all\(\[(.*?)\]\)", open(app).read(), re.S).group(1)
panel = set(re.findall(r"e\((\d+)\)", group))
for tag in ("ha-form", "ha-selector"):
    owns = {os.path.basename(p).split(".")[0] for p in files
            if f'EM)("{tag}")' in open(p, errors="ignore").read()}
    print(tag, sorted(panel & owns) or "NOT LOADED WITH THE PANEL")
PY
```

`ha-select-box` and `ha-entities-picker` are not in that group, but they ride along in
the chunks `ha-selector` lazily loads for the `select` and `entity` selectors, so they
need no help either.

### `ha-form` itself

Thirteen properties, all `attribute: false` except `narrow` and `disabled`. The ones
that matter:

- **`.data`, not `.value`.** Each row reads `data[schema.name]`.
- `value-changed` carries `{ value: <the whole merged data object> }`. `ha-form`
  intercepts each child's `value-changed`, stops it, merges `{[name]: value}` into its
  data and re-fires the lot.
- `computeLabel(schema, data)`, `computeHelper(schema)`, `computeError(error, schema)`,
  `computeWarning`, `localizeValue(key)`.
- `error` / `warning` are objects keyed by field name; the key `base` renders a
  top-level `ha-alert`.
- A node with a `selector` goes to `ha-selector`; a node with a `type` goes to
  `ha-form-${type}`, lazily imported in `willUpdate`. Eleven of those exist —
  `grid`, `expandable`, `select`, `string`, `boolean`, … — and none need importing.

### A node's `name` is what decides whether its data nests

The one line to know, because it is the whole contract for a form with groups in it:

```js
// ha-form: the value handed to each row
const p = (data, item) => (data ? (!item.name || item.flatten ? data : data[item.name]) : void 0)
// ...and its answer, merged back
const o =
  !schema.name || ('flatten' in schema && schema.flatten)
    ? ev.detail.value
    : { [schema.name]: ev.detail.value }
this.data = { ...this.data, ...o }
```

So a **named** `expandable` nests: the rows inside it read and write an object of their own,
and the form's data gains one key per panel rather than one per field. `flatten: true` opts
out, which is what Home Assistant's own badge and heading-entity editors do — they group
`name`/`icon`/`color` under a **Content** panel that still writes flat config keys.

Worth knowing and, in the end, not what the battery card uses. Its device list was built on
named `expandable` nodes first, one per configured device, with a multiple entity picker above
them for adding and reordering — and the thing that sank it is that **nothing in `ha-form` can
hang a drag handle or a delete button off a panel**. The panels could describe the devices but
could never _be_ the list, so the list stayed a separate picker and one device sat in two
controls. See `cards/battery/device-list-editor.ts`, which owns its panels instead.

`ha-form-expandable` itself takes `title`, `icon`, `iconPath`, `expanded` and `headingLevel`,
renders `schema.title || computeLabel(schema)` as the summary, and hands `computeLabel` /
`computeHelper` straight down to the nested `ha-form` — so one `computeLabel` answers for the
rows inside every panel, and the panel is the only thing saying which one they belong to. It
does **not** forward `context` (it declares no such property), which is only worth knowing
because of the next paragraph.

`context` is how a selector is told about a value from elsewhere in the same form:

```js
_generateContext(schema) {
  if (!schema.context && !this.context) return
  const ctx = { ...this.context }
  for (const [key, field] of Object.entries(schema.context ?? {})) ctx[key] = this.data[field]
  return ctx
}
```

Each key is what the selector reads, each value the name of the row to read it from — so
`{name: 'icon', selector: {icon: {}}, context: {icon_entity: 'entity'}}` shows the entity's
own icon in the picker, and `{selector: {entity_name: {}}, context: {entity: 'entity'}}` its
own name. Resolution is against **that** form's data, so inside a nested panel the field
names are the panel's own. This library passes explicit placeholders instead — see
`IconSelector` in `core/types/ha.ts` for the one case where HA's answer is wrong for us.

### Selectors

`ha-selector` dispatches on `Object.keys(selector)[0]`; 57 types ship. Five we use:

```js
{ entity: { filter: { domain: 'calendar' }, multiple: true } }
{ select: { mode: 'box', box_max_columns: 2, options: [{ value, label, description }] } }
{ number: { min: 80, max: 130, step: 5, mode: 'slider', unit_of_measurement: '%' } }
{ icon: { placeholder: 'mdi:watch' } }
{ text: { placeholder: 'Watch battery' } }
```

- `filter` is the current spelling. A top-level `{ entity: { domain } }` still works, but
  only because `ha-selector` migrates it — and the migration lifts `domain`,
  `integration` and `device_class` only, **silently dropping** a `supported_features`
  sitting beside them. `include_domains` is not a thing here at all.
- `filter` may be an array — clauses are ORed, keys inside a clause ANDed, and
  `domain` / `device_class` / `unit_of_measurement` each also accept an array.
- `multiple: true` renders `ha-entities-picker` and emits `string[]`. Removing the last
  entity emits `[]`, never `undefined`. Reordering is opt-in with `reorder: true`.
- **`exclude_entities`** (and `include_entities`) are forwarded to the picker's
  `excludeEntities`/`includeEntities`, so a list editor can hide the ids its own config has
  already taken — the one thing `filter` cannot express, since it is a set of ids rather than
  a property of any entity. They hide _candidates_, not values: a picker whose current value
  is excluded still shows it, which is what lets a row exclude its siblings without blanking
  itself.
- The picker lists everything in `hass.states` that matches; it does **not** hide
  registry-hidden or unavailable entities.
- `select` mode, when omitted, is decided by the option count: under six renders `list`
  (radios), six or more `dropdown`. `box` — tiles with an optional `description` line —
  is never chosen for you. An older frontend that does not know `box` falls through to
  the dropdown rather than breaking.
- `number` is a box, not a slider, unless it is given **both** `min` and `max`:

  ```js
  // ha-selector-number.render(), chunk 6749 — the same decision, unminified
  const isBox =
    'box' === this.selector.number?.mode ||
    void 0 === this.selector.number?.min ||
    void 0 === this.selector.number?.max
  ```

  So `mode: 'slider'` is a statement of intent rather than the thing that decides it. The
  slider is drawn with an `ha-input` beside it, which is where the value and the unit are
  read; `unit_of_measurement` is passed through raw unless a `translation_key` sits beside
  it, so a bare `'%'` shows as `%`.

- Both of its handlers emit a **number**: `Number(target.value)` from the slider, and from
  the box the same or `undefined` when the field is emptied or unparseable — never `''`,
  and never a numeric string. So a number selector is the one control that cannot put a
  `"110"` in somebody's config, and `applyFormData` sees a real blank when they clear it.
- Its chunk is **not** in the `lovelace` panel group (the check above prints `False` for
  6749), so it arrives with the lazy import `ha-selector` does when it first sees the
  selector — same as `ha-select-box` and `ha-entities-picker`, and it needs no help either.
- `icon` renders `ha-icon-picker`, a searchable combo box over the whole set. Its
  `placeholder` **wins over** the icon it would work out for itself from
  `context.icon_entity`, which is what makes it usable for a battery sensor: HA's own state
  icon for one is computed from the level, so its guess is `mdi:battery-70` where this
  library draws `mdi:battery`.
- `text` renders `ha-input`, and reports **`undefined`** rather than `''` for a field that
  has been emptied — as long as the row is not `required`. That is what lets an override
  disappear from a config instead of sitting in it blank.

### The list-of-objects selector — considered, and not used

`{ object: { fields, multiple, label_field, description_field, translation_key } }` is HA's
current answer to a list whose rows carry more than an id, and it is what its own heading
badges and markdown buttons use. Given `fields` it draws a sortable `ha-md-list` — drag
handle, pencil, bin, an **Add** button — and edits one row in a modal `dialog-form` built
from those fields; without `fields` it falls back to a raw `ha-yaml-editor`. Worth knowing:

- `fields` is `{[name]: {selector, required?, label?, description?}}`, and the per-field
  `label`/`description` are read directly, so no translation key is needed.
- the item's headline is `label_field` formatted **through that field's own selector** — an
  entity id comes out as `hass.formatEntityName(...)`, i.e. the friendly name — and with no
  `label_field` it joins every set field with `·`.
- `dialog-form` seeds its data with the whole item and submits `this._data`, so keys the
  `fields` do not mention survive an edit rather than being dropped.
- but its `_schema` maps only `{name, selector, required}` and **drops `context`**, so the
  placeholder trick above is not available inside the dialog.

The battery card hand-rolls the same list instead, for the one reason that survives all of
this: its rows expand **in place**. A modal is a fine way to edit a row of six settings and a
poor way to change one icon, and the placeholder that says which icon you are overriding
cannot be shown inside the dialog anyway.

### What a hand-rolled list editor may render

`hui-entities-card-row-editor` is the shape to copy — `ha-sortable` around a wrapper, an
`item-moved` event carrying two indices, an empty picker as the add control, and clearing a
row's entity as the way to delete it. Two details of theirs are worth having as well:
`.addButton=${entities.length > 0}` on the add picker, which turns it into a **button** that
opens the list rather than a field sitting there filled in (the picker's own template branches
on `addButtonLabel && !this.value` and renders `ha-button … @click=${this.open}`), and
`excludeEntities` on it so an entity already in the list is not offered.

Both are properties of `ha-entity-picker` rather than of the entity _selector_, and only the
exclusion has a selector key, so an add control that wants the button has to render the picker
itself. Two things make that worth the trouble rather than reimplementing it:

```js
// ha-entity-picker.render(), deminified
.value=${this.addButton ? void 0 : this.value}
.addButtonLabel=${this.addButton ? this.addButtonLabel ?? localize('ui.components.entity.entity-picker.add') : void 0}
// and, separately
async open() { await this.updateComplete; await this._picker?.open() }
```

In `addButton` mode it passes `undefined` down as its value **whatever it holds** — so it is a
button before the press, its own `open` runs on the press, and it is a button again afterwards
with nothing for the editor to reset. `value-changed` carries the bare id, not the
`{ [name]: value }` an `ha-form` reports.

Reaching for `open()` from outside instead is a trap this library fell into first: walking the
shadow trees under an `ha-form` for something with an `open` method finds `ha-generic-picker`
or the combo box below it rather than the picker, and what that looks like on screen is a
popover that opens and shuts again. The lever is on `ha-entity-picker` and nowhere else.

Which brings up what a hand-rolled editor may render at all. Checked with the panel-group
script from the `ha-form` section, substituting each tag:

| in the `lovelace` panel group                                                                       | **not** in it                                                                         |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ha-form`, `ha-selector`, `ha-icon`, `ha-svg-icon`, `ha-icon-button`, `ha-alert`, `ha-md-list-item` | `ha-button`, `ha-entity-picker`, `ha-icon-picker`, `ha-entities-picker`, `ha-md-list` |
| `ha-sortable`, `ha-expansion-panel`                                                                 |                                                                                       |

The right-hand column is the trap, because an undefined custom element renders as **nothing at
all** — no error, no box, just a gap that reads as a bug in your own file. `ha-entity-picker`
and `ha-icon-picker` are reached the safe way, through an `ha-form` row whose selector asks for
them, so `ha-selector` does the lazy import it exists to do. `ha-button` has no such route,
which is one more reason the battery card's add control is a picker rather than a button.

`ha-sortable` (chunk 88519), deminified where it matters:

```js
createRenderRoot() { return this }                        // light DOM: the rows stay yours
async _createSortable() {
  const container = this.children[0]                      // its FIRST child, not itself
  if (!container) return
  const Sortable = (await import(/* 10294, 75781 */)).default
  this._sortable = new Sortable(container, { handle: this.handleSelector, ... })
}
_handleUpdate = e => fireEvent(this, 'item-moved', { newIndex: e.newIndex, oldIndex: e.oldIndex })
_handleChoose = e => { this.rollback && (e.item.placeholder = document.createComment('sort-placeholder'), e.item.after(e.item.placeholder)) }
_handleEnd = async e => { fireEvent(this, 'drag-end'); this.rollback && e.item.placeholder && (e.item.placeholder.replaceWith(e.item), delete e.item.placeholder) }
```

Three consequences. It needs a **wrapper element** to make sortable — its own children are
the container, not the items. `rollback` defaults **true**, so it undoes its own DOM move on
drop and the re-render is what actually reorders: the list is data-driven, and a handler that
tried to move the DOM itself would fight it. And sortablejs arrives lazily, so the first drag
of a session has a chunk to fetch.

`ha-expansion-panel`'s summary, for anyone hanging chrome off one:

```js
<div class="top">
  <div id="summary" @click=${toggle} @keydown=${toggle} role="button" tabindex="0">
    ${leftChevron ? chevron : nothing}
    <slot name="leading-icon"></slot>
    <slot name="header"><div class="header">${this.header}<slot class="secondary" name="secondary">${this.secondary}</slot></div></slot>
    <slot name="event"></slot>
    ${leftChevron ? nothing : chevron}
    <slot name="icons"></slot>
  </div>
</div>
<div class="container ${expanded}">${this._showContent ? html`<slot></slot>` : ''}</div>
```

- `header` and `secondary` are **properties** that fill the default content of the `header`
  slot, so a two-line summary needs no markup of its own.
- `icons` is a trailing slot **inside** `#summary` — where a per-panel action button goes.
- and it is inside the click target, so a button there must `preventDefault()`: the toggle
  opens with `if (e.defaultPrevented) return`, which is the only thing standing between a
  delete button and a panel that opens as its row is removed.
- `expanded-changed` reports a user toggle; `expanded` is a property you may also set.

Home Assistant's own calendar card editor is a useful reference but not a model: it
predates the entity selector and still hand-renders an `<ha-entities-picker>` beside its
`ha-form`, with the label in a bare `<h3>`.

### Strings

`hass.localize(key)` returns `''` for a key it does not have, so `localize(k) || fallback`
is the right shape. `ui.panel.lovelace.editor.card.calendar.calendar_entities`
("Calendar entities") is translated into every language HA ships and lives in the
lazily-loaded `lovelace` translation fragment — which is loaded whenever an editor is
open, so a card editor can borrow it.

## Icons and more-info (VERIFIED)

### `ha-icon` needs no loading either, same as `ha-form`

`ha-icon` (chunk **14628**) and `ha-svg-icon` (**72966**) are both in the `lovelace` panel's
own initial promise group, so a card can render `<ha-icon icon="mdi:…">` with no import dance.
Re-check with the script in the `ha-form` section above, substituting the tag names.

`ha-icon` takes its size from `--mdc-icon-size` and from nothing else — its `:host` rule is
`width: var(--mdc-icon-size, 24px); height: var(--mdc-icon-size, 24px)`, with `fill:
currentcolor`. A card that wants an icon to scale with its own layout has to set that property;
there is no `size` attribute.

Two reasons to reach for `ha-icon` rather than an inlined `@mdi/js` path, and one against.
For: it resolves whatever name the user put in `attributes.icon`, which a card cannot enumerate
ahead of time, and it goes through HA's own icon cache. Against: it resolves asynchronously out
of IndexedDB, so anything measured off the glyph is measured at the wrong height for a frame —
which is why the calendar's all-day badge is an inlined path and the battery card's device icon
is not. The battery icon's size is a CSS length, not a measurement.

The dev harness has no icon registry at all, so `dev/ha-stubs.ts` carries a small lookup table
standing in for one. Importing all of `@mdi/js` there would put ~1MB of path strings into the
published showcase.

### `hass-more-info`

The event Home Assistant's own cards fire to open a device's dialog, with the entity id under
`entityId`:

```js
_openMoreInfo(e) { fireEvent(this, "hass-more-info", { entityId: e.currentTarget.stateObj.entity_id }) }
```

`fireEvent` sets `bubbles: true, composed: true, cancelable: false`, and the listener is on the
dashboard, so a card firing this from inside its own shadow root must set both flags itself.

```bash
docker run --rm --entrypoint bash ghcr.io/home-assistant/home-assistant:stable -c \
  'grep -roh -E ".{80}\"hass-more-info\".{120}" /usr/local/lib/python3.*/site-packages/hass_frontend/frontend_latest/*.js | head'
```

### The device classes the battery card leans on

`sensor` has `battery` (a percentage) and `binary_sensor` has `battery_charging` — both in
`/usr/src/homeassistant/homeassistant/components/*/__init__.py` inside the image, which is
where core's Python lives; `site-packages/homeassistant` is only the dist-info licence copy.
A single `filter: { domain: 'sensor', device_class: 'battery' }` clause is therefore enough to
turn the card's picker from every sensor in the installation into the dozen that are batteries.
`battery_charging` is not in a picker at all — `charging_entity` is per row, and a multiple
entity picker cannot express that (see `CupertinoCardEditor`'s `toForm`/`fromForm`).

## Theming — HA has a real design-token system now

Legacy card vars (still present):
`--ha-card-background`, `--ha-card-border-radius`, `--ha-card-border-width`,
`--ha-card-border-color`, `--ha-card-box-shadow`, `--ha-card-backdrop-filter`,
`--ha-card-header-color`, `--ha-card-header-font-family`, `--ha-card-header-font-size`,
`--ha-card-feature-gap`, `--ha-card-features-border-radius`

Newer token scales — these are what we bridge our Cupertino tokens onto:

- Typography: `--ha-font-family-body|heading|code|longform`,
  `--ha-font-size-xs|s|m|l|xl|2xl|3xl|4xl|5xl`, `--ha-font-size-scale`,
  `--ha-font-weight-light|normal|medium|semi-bold|bold|body|heading|action`,
  `--ha-font-body`, `--ha-font-body-l`, `--ha-font-smoothing`
- Spacing: `--ha-space-1` … `--ha-space-19`
- Radii: `--ha-border-radius-sm|s|small|md|lg|2xl|3xl|4xl|5xl|6xl|pill|circle`

Consuming these means a user theme restyles our cards for free, while our own
`--cw-*` layer adds the Cupertino rhythm on top.

## Toolchain — probed locally, not guessed

Current registry versions (2026-07-25): lit **3.3.3**, vite **8.1.5**,
typescript **7.0.2**, eslint 10.8.0, prettier 3.9.6,
custom-card-helpers 2.0.0 (published 2026-02-21 — alive again),
home-assistant-js-websocket 9.6.0.

### Vite 8 is Rolldown-based, and esbuild is GONE

`vite@8.1.5` dependencies: `lightningcss, picomatch, postcss, rolldown, tinyglobby`.
Two breaking consequences found by actually running the build:

1. `minify: 'esbuild'` **fails hard**:
   `Failed to load transformWithEsbuild. It is deprecated and it now requires esbuild
to be installed separately... migrate to transformWithOxc instead.`
   => use `minify: 'oxc'` (or just `true`, same result).
2. `rollupOptions.output.inlineDynamicImports` is deprecated:
   `WARN inlineDynamicImports option is deprecated, please use codeSplitting: false`
   => use top-level `build.codeSplitting: false`.

### Verified-working single-file config

```ts
build: {
  lib: { entry: 'src/…', formats: ['es'], fileName: () => 'cupertino-widgets.js' },
  codeSplitting: false,
  minify: 'oxc',
  target: 'es2022',
  sourcemap: true,
}
```

Result: one 21.6 kB file (7.2 kB gzip) with Lit bundled in, **zero** leftover bare
imports — verified by regex over the output. No separate CSS file (Lit `css` tagged
templates stay in JS).

### Decorators: experimental, and TS 7 still supports them

TS 7.0.2 is the native port, but `experimentalDecorators` is intact.
Probed a real Lit element (`@customElement` + `@property` + `@state`):

- `experimentalDecorators: true` + `useDefineForClassFields: false` -> **exit 0, clean**
- standard/TC39 decorators (no `experimentalDecorators`) -> **TS1240 + TS1270**,
  because Lit's standard-decorator mode requires the `accessor` keyword on
  `@property`/`@state` fields.

Vite 8/Rolldown transpiles the experimental form correctly (`__decorate([...])`
present in output, `customElements.define` emitted). So: stay on experimental
decorators; it is the path with zero friction across TS 7 + Vite 8 + Lit 3.

## Dev-loop plumbing — proven end to end

Host `./dist` -> container `/config/www/cupertino-widgets/` -> served at
`/local/cupertino-widgets/cupertino-widgets.js`, **HTTP 200 verified with curl**.

Caveat found: HA serves `/local/` with `Cache-Control: public, max-age=2678400`
(31 days). Combined with the fact that `customElements.define` cannot re-register an
already-defined tag in a live page, iterating inside HA always costs a reload.
=> the mock-hass harness with HMR is the primary loop; real HA is the verification loop.

### And a second cache, which is the one that wastes an afternoon

`hass_frontend/service_worker.js` registers eight routes, and the LAST is a catch-all that
`/local/` reaches because nothing above claims it:

```js
registerRoute(/\/(static|frontend_latest|frontend_es5)\/.+/, new CacheFirst({ matchOptions: { ignoreSearch: true } }))
registerRoute(brandsImage,                                    new StaleWhileRevalidate({ cacheName: 'brands', … }))
registerRoute(cameraProxy && GET,                             …)
registerRoute(/\/(api|auth)\/.*/,                             new NetworkOnly())
registerRoute(/\/(?:manifest\.json|onboarding\.html)/,        new NetworkOnly())
registerRoute(/\/(\?.*)?$/,                                   new StaleWhileRevalidate({ matchOptions: { ignoreSearch: true } }))
registerRoute(/\/.*/, new StaleWhileRevalidate({               // <-- /local/ lands here
  cacheName: 'file-cache',
  plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 })],
}))
```

Identified from the minified `_handle` bodies rather than from strings, since the strategy
names do not survive the build — `StaleWhileRevalidate` is the one that fires
`fetchAndCachePut`, `waitUntil`s it, and then prefers `cacheMatch`:

```js
async _handle(request, handler) {
  const fetched = handler.fetchAndCachePut(request).catch(() => {})
  handler.waitUntil(fetched)
  let response = await handler.cacheMatch(request)      // cache wins
  if (!response) response = await fetched
  return response
}
```

So the symptom is not "stale", it is **one build behind**: the reload after the one you
expected is when your code shows up. That reads as flakiness and sends you looking in the
wrong place.

A hard reload does not fix it, and the reason is worth writing down: HA loads a dashboard
resource by appending a script element at runtime —

```js
// deminified: the `module` branch of the panel/resource loader
loadModule = url => appendScript('script', url, 'module')
// appendScript builds the element, sets src, and document.body.appendChild()s it
```

A force-reload sets the service-workers mode to none for the navigation and for the
subresources the parser found in the HTML. A fetch a script issues afterwards is neither, so
it goes through the worker as usual, and the revalidation the worker fires behind it is
answered by the month-old HTTP entry.

Both caches key on the full URL **including the query** — that catch-all sets no
`ignoreSearch`, unlike the `/static/` route above it — so bumping `?v=` on the resource is
what misses both. `pnpm verify` does that and force-recreates; `dev/bump-resource.mjs` is
the bump. The interactive alternative is DevTools -> Application -> Service Workers ->
"Bypass for network" plus "Disable cache", both of which last only as long as DevTools is
open.

## Dev HA instance config — the clean way to pin the resource

`lovelace.resource_mode` is a real, current key (`CONF_RESOURCE_MODE = "resource_mode"`
in `components/lovelace/const.py`), independent of the dashboard `mode`:

```yaml
lovelace:
  resource_mode: yaml # resource pinned declaratively
  resources:
    - url: /local/cupertino-widgets/cupertino-widgets.js
      type: module
```

Dashboards stay in storage mode (the default) so the card picker and visual editors
still work, while the resource needs no manual UI step. Booted HA 2026.7.4 with this
and got zero config errors.

Note: top-level `lovelace.mode` is marked `# Deprecated - Remove in 2026.8`, and so is
the fallback `resource_mode = config.get(CONF_RESOURCE_MODE, mode)`. Setting
`resource_mode` explicitly (and not setting `mode`) is the future-proof form.

`demo:` still works via YAML (`CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)` plus an
import flow), giving `calendar.calendar_1` / `calendar.calendar_2` to develop against.
`local_calendar` and `local_todo` ship in core for writable dev data.

## `layout` is Home Assistant's property, not ours

A card element must not define its own `layout` property. Wrapper cards forward the
view's layout type straight down:

```js
// hui-entity-filter-card.shouldUpdate
this._element.hass = this.hass
this._element.preview = this.preview
this._element.layout = this.layout // "grid" | "panel" | ...
```

`hui-card` itself gets `layout = "grid"` assigned imperatively. A card nested inside
`conditional` or `entity-filter` would therefore have its own `layout` silently
clobbered. Hence `cwLayout` / the `cw-layout` attribute in `core/base-card.ts`.

`preview` is the opposite case: Home Assistant sets it and we are meant to read it.
