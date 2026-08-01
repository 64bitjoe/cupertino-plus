/**
 * Going to another Home Assistant page from inside a card.
 *
 * The frontend is a single-page app whose router listens for one event, so a card cannot
 * just assign to `location.href`: that reloads the whole dashboard — the app, the theme, the
 * websocket, every custom resource — to reach a page the browser already has. What a tap on
 * a widget should cost is a history entry.
 *
 * `navigate()` in the frontend's `common/navigate` is the function that does it, and this is
 * that function with the parts a card cannot use taken out. Deminified from the 2026.7.4
 * bundle:
 *
 * ```js
 * const navigate = async (path, options) => {
 *   if (!(await closeOpenDialogs(Date.now()))) return false
 *   const replace = options?.replace || false
 *   replace
 *     ? mainWindow.history.replaceState(mainWindow.history.state?.root ? { root: true } : null, '', path)
 *     : mainWindow.history.pushState(null, '', path)
 *   fireEvent(mainWindow, 'location-changed', { replace })
 *   return true
 * }
 * ```
 *
 * Two omissions, both deliberate. The dialog preamble guards navigation *out of an open
 * dialog* — it reads `history.state.dialog` and needs the frontend's own dialog registry to
 * close one — and a card sitting on a dashboard has no dialog of its own to close. And
 * `replace` stays false: a tap on a widget is somewhere the back button has to bring the
 * user home from.
 *
 * An `<a href>` would have been the better answer — a real link, with middle-click, focus
 * semantics and "copy link address" for free — and it does not work here. Nothing in the
 * main app delegates anchor clicks. The one `document.body` listener that turns an `A` in a
 * click's composed path into a route lives in `custom-panel.js`, which is the iframe wrapper
 * around third-party *panels*; inside a dashboard the browser handles the anchor itself, and
 * that is the full reload again. Home Assistant's own energy card links out with an
 * `<a href>` and pays exactly that price.
 */

/** The name Home Assistant gives the window its router lives in. */
const MAIN_WINDOW_NAME = 'ha-main-window'

/**
 * That window, resolved the way the frontend resolves it.
 *
 * It is `window` on a dashboard, and the frontend still does not assume so, because a
 * dashboard can be inside an iframe — Home Assistant's own `iframe` card will put one there
 * — and then the history entry belongs to the window whose router will act on it rather than
 * to the frame that asked. Reading `parent.name` across origins throws, which is what the
 * catch is for.
 *
 * Resolved per call rather than once at module load: the tests run in node, where there is
 * no `window` at all, and a module-level probe would fail on import rather than on use.
 */
const routerWindow = (): Window => {
  try {
    if (window.name === MAIN_WINDOW_NAME) return window
    if (parent.name === MAIN_WINDOW_NAME) return parent
    return top ?? window
  } catch {
    return window
  }
}

/**
 * Send the browser to `path`, as a tap on a row does.
 *
 * Fired on the window rather than from the card's element, which is the one place this
 * differs in shape from the rest of the library's events: `hass-more-info` is a request
 * addressed to whichever ancestor is listening, so it bubbles out of the shadow root, while
 * the router's listener is `window.addEventListener('location-changed', …)` and the window
 * it is on may not be the one the card is in.
 */
export const cwNavigate = (path: string): void => {
  const target = routerWindow()
  target.history.pushState(null, '', path)
  target.dispatchEvent(
    new CustomEvent('location-changed', {
      detail: { replace: false },
      bubbles: true,
      composed: true,
    }),
  )
}
