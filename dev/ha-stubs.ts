/**
 * Stand-ins for the Home Assistant frontend elements our cards use.
 *
 * The CSS below is copied from the `ha-card` that ships inside
 * home-assistant 2026.7.4, so the harness shows the same surface the real
 * dashboard does — including the 1px border that is easy to forget about.
 */

const HA_CARD_CSS = `
  :host {
    background: var(--ha-card-background, var(--card-background-color, white));
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    box-shadow: var(--ha-card-box-shadow, none);
    box-sizing: border-box;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
    border-width: var(--ha-card-border-width, 1px);
    border-style: solid;
    border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    color: var(--primary-text-color);
    display: block;
    transition: all 0.3s ease-out 0s;
  }
`

class HaCardStub extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HA_CARD_CSS
    root.append(style, document.createElement('slot'))
  }
}

export function defineHaStubs(): void {
  if (!customElements.get('ha-card')) {
    customElements.define('ha-card', HaCardStub)
  }
}
