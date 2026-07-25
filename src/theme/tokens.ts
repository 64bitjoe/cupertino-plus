import { css } from 'lit'

/**
 * The `--cw-*` layer.
 *
 * Every token falls back through a Home Assistant theme variable first, so a user's
 * theme restyles these cards for free, and only then to an Apple-ish default. Cards
 * must never read `--primary-text-color` and friends directly — they read `--cw-*`,
 * and this file is the single place where the bridge lives.
 *
 * Dark values hang off `:host([dark])`, which the base card reflects from
 * `hass.themes.darkMode`. A `prefers-color-scheme` media query would be wrong here:
 * Home Assistant's theme is chosen in HA, not by the OS.
 */
export const tokens = css`
  :host {
    /* ---- Typography -------------------------------------------------------- */
    /* San Francisco on Apple hardware, then whatever the HA theme asked for. */
    --cw-font:
      -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui,
      var(--ha-font-family-body, Roboto), 'Helvetica Neue', Arial, sans-serif;

    /* Apple's text styles, trimmed to what widgets use. size / line-height */
    --cw-text-large-title: 700 34px/41px var(--cw-font);
    --cw-text-title-1: 700 28px/34px var(--cw-font);
    --cw-text-title-2: 700 22px/28px var(--cw-font);
    --cw-text-title-3: 600 20px/25px var(--cw-font);
    --cw-text-headline: 600 17px/22px var(--cw-font);
    --cw-text-body: 400 17px/22px var(--cw-font);
    --cw-text-callout: 400 16px/21px var(--cw-font);
    --cw-text-subheadline: 400 15px/20px var(--cw-font);
    --cw-text-footnote: 400 13px/18px var(--cw-font);
    --cw-text-caption-1: 400 12px/16px var(--cw-font);
    --cw-text-caption-2: 500 11px/13px var(--cw-font);

    /* ---- Colour ------------------------------------------------------------ */
    --cw-label: var(--primary-text-color, #000);
    --cw-label-secondary: var(--secondary-text-color, rgba(60, 60, 67, 0.6));
    --cw-label-tertiary: color-mix(in srgb, var(--cw-label-secondary) 55%, transparent);
    --cw-separator: var(--divider-color, rgba(60, 60, 67, 0.29));
    /* iOS "fill" greys: the tint behind chips, dividers and empty slots. */
    --cw-fill: rgba(120, 120, 128, 0.12);
    --cw-fill-strong: rgba(120, 120, 128, 0.2);

    --cw-accent: var(--primary-color, #007aff);
    --cw-red: #ff3b30;
    --cw-orange: #ff9500;
    --cw-yellow: #ffcc00;
    --cw-green: #34c759;
    --cw-blue: #007aff;
    --cw-indigo: #5856d6;
    --cw-purple: #af52de;
    --cw-pink: #ff2d55;

    /* ---- Surface ----------------------------------------------------------- */
    --cw-surface: var(--ha-card-background, var(--card-background-color, #fff));
    /* iOS widgets are noticeably rounder than HA's default card. */
    --cw-radius: var(--ha-card-border-radius, 22px);
    --cw-radius-inner: 12px;
    --cw-radius-pill: 999px;

    /* ---- Spacing ----------------------------------------------------------- */
    /* Home Assistant's own scale is 4px-stepped (--ha-space-1 is 4px), the same
       grid Apple uses, so we ride on it and inherit any theme that rescales it. */
    --cw-space-1: var(--ha-space-1, 4px);
    --cw-space-2: var(--ha-space-2, 8px);
    --cw-space-3: var(--ha-space-3, 12px);
    --cw-space-4: var(--ha-space-4, 16px);
    --cw-space-5: var(--ha-space-5, 20px);
    --cw-space-6: var(--ha-space-6, 24px);
    /* Apple keeps widget content off the rounded edge by roughly this much. */
    --cw-inset: 16px;

    /* ---- Motion ------------------------------------------------------------ */
    /* The curve iOS uses for sheets and springs; feels "settled", not linear. */
    --cw-ease: cubic-bezier(0.32, 0.72, 0, 1);
    --cw-ease-out: cubic-bezier(0.25, 0.1, 0.25, 1);
    --cw-duration-fast: 150ms;
    --cw-duration: 250ms;
  }

  :host([dark]) {
    --cw-label: var(--primary-text-color, #fff);
    --cw-label-secondary: var(--secondary-text-color, rgba(235, 235, 245, 0.6));
    --cw-separator: var(--divider-color, rgba(84, 84, 88, 0.65));
    --cw-fill: rgba(120, 120, 128, 0.24);
    --cw-fill-strong: rgba(120, 120, 128, 0.36);

    --cw-red: #ff453a;
    --cw-orange: #ff9f0a;
    --cw-yellow: #ffd60a;
    --cw-green: #30d158;
    --cw-blue: #0a84ff;
    --cw-indigo: #5e5ce6;
    --cw-purple: #bf5af2;
    --cw-pink: #ff375f;

    --cw-surface: var(--ha-card-background, var(--card-background-color, #1c1c1e));
  }
`
