/**
 * The showcase site.
 *
 * Two audiences, one page. A visitor deciding whether to install this gets the previews
 * and the panel under them to change what the cards are showing, and nothing else to
 * read. Anyone working on a card opens **Advanced**, which is where the odd footprints
 * and the config editor live.
 *
 * `pnpm dev` serves it. `pnpm build:site` builds the same page for GitHub Pages.
 */

import { html, nothing, render, type TemplateResult } from 'lit'
import { mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js'

import '../../src/index'
import '../ha-theme.css'
import './site.css'

import { VERSION } from '../../src/core/register'
import { defineHaStubs } from '../ha-stubs'
import { advanced, previews } from './canvas'
import { CARD_OPTIONS, ENVIRONMENT, PLANNED, WIDGETS, type Widget } from './catalog'
import { configPanel, controlsPanel, type ControlBinding } from './inspector'
import { ensureEditor, pushEditorHass, resetEditor } from './editor'
import { icon } from './icon'
import { hrefFor, startRouter } from './router'
import { clearStage, syncStage } from './stage'
import {
  changed,
  currentArgs,
  envArgs,
  hass,
  onChange,
  sectionWidth,
  setAdvanced,
  setArg,
  setDrag,
  setEnv,
  setTheme,
  setWidget,
  site,
  type Theme,
} from './state'

defineHaStubs()

const REPO = 'https://github.com/sabbaken/cupertino-widgets'

/**
 * Links out, not routes.
 *
 * Everything the library has to say in prose is already written down in the repository,
 * and a page here saying the same thing worse is one more place for it to go stale.
 */
const LIBRARY = [
  { name: 'Install', href: `${REPO}#install` },
  { name: 'How sizing works', href: `${REPO}/blob/main/docs/calendar-widget-rules.md` },
  { name: 'Source', href: REPO },
]

// ---- Chrome ------------------------------------------------------------------------

const sidebar = (current: Widget): TemplateResult => html`
  <aside class="sidebar">
    <a class="brand" href=${hrefFor(WIDGETS[0] as Widget)}>
      <span>Cupertino Widgets</span>
      <span class="brand-version">${VERSION}</span>
    </a>

    <nav class="nav" aria-label="Widgets">
      <p class="nav-label">Widgets</p>
      <ul class="nav-list">
        ${WIDGETS.map(
          widget => html`
            <li>
              <a
                class=${widget === current ? 'nav-item is-current' : 'nav-item'}
                href=${hrefFor(widget)}
                aria-current=${widget === current ? 'page' : nothing}
              >
                ${icon(widget.icon)}<span class="nav-name">${widget.name}</span>
              </a>
            </li>
          `,
        )}
        ${PLANNED.map(
          entry => html`
            <li>
              <span class="nav-item is-planned">
                ${icon(entry.icon)}<span class="nav-name">${entry.name}</span>
                <span class="nav-note">soon</span>
              </span>
            </li>
          `,
        )}
      </ul>

      <p class="nav-label">Library</p>
      <ul class="nav-list">
        ${LIBRARY.map(
          entry => html`
            <li>
              <a class="nav-item" href=${entry.href} rel="noreferrer">
                <span class="nav-name">${entry.name}</span>
              </a>
            </li>
          `,
        )}
      </ul>
    </nav>

    <div class="sidebar-foot"><p>AGPL-3.0 · installs through HACS</p></div>
  </aside>
`

const header = (widget: Widget, theme: Theme): TemplateResult => {
  const dark = theme === 'dark'
  return html`
    <header class="header">
      <div class="header-title">
        <h1>${widget.name}</h1>
        <p>${widget.tagline}</p>
      </div>
      <button
        type="button"
        class="icon-button"
        aria-label=${dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
        @click=${() => setTheme(dark ? 'light' : 'dark')}
      >
        ${icon(dark ? mdiWhiteBalanceSunny : mdiWeatherNight)}
      </button>
    </header>
  `
}

// ---- The inspector -------------------------------------------------------------------

let copied = false

const copyConfig = (text: string): void => {
  void navigator.clipboard
    .writeText(text)
    .then(() => {
      copied = true
      changed()
      setTimeout(() => {
        copied = false
        changed()
      }, 1600)
    })
    // Clipboard access can be refused outright. The YAML is on screen and selectable, so
    // the button quietly doing nothing is a smaller failure than an alert about it.
    .catch(() => undefined)
}

/**
 * The right-hand column: the config first, then everything that changes it.
 *
 * A column rather than a strip along the bottom, because the widgets are narrow and tall.
 * Beside them there is room for both; under them the control you are dragging ends up off
 * the screen from the card it is changing.
 */
const inspector = (widget: Widget): TemplateResult => {
  const bindings: ControlBinding[] = [
    // The widget's own options first, then the ones every card has, then the fake
    // dashboard's. The panel regroups them by whether they survive installation, so this
    // order only settles what comes first inside a group.
    ...[...widget.props, ...CARD_OPTIONS].map(control => ({
      control,
      args: currentArgs(),
      onInput: setArg,
    })),
    ...ENVIRONMENT.map(control => ({ control, args: envArgs(), onInput: setEnv })),
  ]

  return html`
    <aside class="inspector" aria-label="Widget settings">
      ${configPanel(widget, currentArgs(), copied, copyConfig)} ${controlsPanel(bindings, hass())}
    </aside>
  `
}

// ---- The page ------------------------------------------------------------------------

const page = (): TemplateResult => {
  const state = site()
  // Asked for only once the section is open, because a card is allowed to code-split its
  // editor and a page that loaded it eagerly would never notice.
  const panel = state.advanced ? ensureEditor(state.widget, hass(), changed) : undefined

  return html`
    <div class="site">
      ${sidebar(state.widget)}
      <div class="main">
        ${header(state.widget, state.theme)}
        <div class="canvas">
          ${previews(state.widget, sectionWidth(), setDrag)}
          ${advanced(state.widget, sectionWidth(), state.advanced, panel, setAdvanced)}
        </div>
      </div>
      ${inspector(state.widget)}
    </div>
  `
}

const root = document.getElementById('app') as HTMLElement

const draw = (): void => {
  const state = site()
  // The theme classes are Home Assistant's, and they go on `body` so that a card anywhere
  // on the page — including the one inside the editor panel — inherits the same dashboard
  // tokens it would inherit from a real dashboard.
  document.body.className = state.theme === 'dark' ? 'theme-dark' : 'theme-light'

  render(page(), root)

  // After the render, so a card created by this very pass is configured before its own
  // first update runs.
  const current = hass()
  syncStage(state.widget, currentArgs(), current)
  pushEditorHass(current)
}

onChange(draw)

startRouter(widget => {
  if (site().widget !== widget) {
    clearStage()
    resetEditor()
  }
  setWidget(widget)
  // Also the first draw: `setWidget` has nothing to report when the route already matches
  // the widget the page started on.
  changed()
})
