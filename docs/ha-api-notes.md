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
   => the card must render from its ACTUAL measured size, not from its configured
   `size`. `getGridOptions()` only supplies good _defaults_ + min/max clamps.
3. `getCardSize()` is still used for the legacy masonry layout — ship both.

Grid is **12 columns**. Confirmed by real cards in the bundle:

- `history-graph`: `getGridOptions(){return{columns:12,min_columns:6,min_rows:2}}`
- a strategy generating `grid_options:{columns:12}` (full width) and `{columns:6}` (half)

`rows: "auto"` IS supported. Real card in the bundle:

```js
getGridOptions() {
  return { columns: 6, rows: this.preview ? "auto" : 1, min_rows: 1, min_columns: 6 }
}
```

Note `this.preview` — **HA sets a `preview` property on the card element** when it is
rendered inside the card picker. Cards use it to size differently in the picker.

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

## Theming — HA has a real design-token system now

Legacy card vars (still present):
`--ha-card-background`, `--ha-card-border-radius`, `--ha-card-border-width`,
`--ha-card-border-color`, `--ha-card-box-shadow`, `--ha-card-backdrop-filter`,
`--ha-card-header-color`, `--ha-card-header-font-family`, `--ha-card-header-font-size`,
`--ha-card-feature-gap`, `--ha-card-features-border-radius`

Newer token scales — these are what we bridge our iOS tokens onto:

- Typography: `--ha-font-family-body|heading|code|longform`,
  `--ha-font-size-xs|s|m|l|xl|2xl|3xl|4xl|5xl`, `--ha-font-size-scale`,
  `--ha-font-weight-light|normal|medium|semi-bold|bold|body|heading|action`,
  `--ha-font-body`, `--ha-font-body-l`, `--ha-font-smoothing`
- Spacing: `--ha-space-1` … `--ha-space-19`
- Radii: `--ha-border-radius-sm|s|small|md|lg|2xl|3xl|4xl|5xl|6xl|pill|circle`

Consuming these means a user theme restyles our cards for free, while our own
`--cw-*` layer adds the iOS rhythm on top.

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
already-defined tag in a live page, iterating inside HA always costs a hard reload.
=> the mock-hass harness with HMR is the primary loop; real HA is the verification loop.

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
