import { css } from 'lit'

/**
 * Structural CSS every card shares.
 *
 * `ha-card` stays the root element: it is what themes and `card_mod` target, and
 * Home Assistant's edit-mode chrome expects it. We restyle it through our own
 * tokens instead of replacing it.
 */
export const baseStyles = css`
  :host {
    display: block;
    /* Fills the grid cell. In the sections layout that cell is a block box of definite
       height -- the 2026.7 frontend gives it
       .card.fit-rows { height: calc(rows * (56px + 8px) - 8px) } -- and our element is
       a plain block child of it, so without this a card dragged taller than its
       configured size would sit at its own content height inside a taller cell. In the
       masonry layout the parent has no definite height, so this resolves to auto and
       --cw-min-height takes over. */
    height: 100%;
    /* Which also means --cw-min-height must not win against a cell the user dragged
       *shorter* than the configured size: the card would spill out of it, and the row
       budget -- computed from the measured box -- would stop describing what is drawn.
       A percentage max-height is exactly the clamp we want, because it resolves to
       none in the masonry layout, where there is no cell to obey. */
    max-height: 100%;
    font: var(--cw-text-body);
    color: var(--cw-label);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ha-card {
    /* Fill the grid cell in the sections layout... */
    height: 100%;
    /* ...and still have a height in the legacy masonry layout, where the cell is
       content-sized. Set per configured size by the base card, which also keeps the
       measured height stable enough that layout switching cannot oscillate. */
    min-height: var(--cw-min-height, auto);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--cw-radius);
    /* Never let a long event title push the card wider than its cell. */
    min-width: 0;
  }

  /* Apple's touch feedback: the whole surface dips slightly, it does not flash. */
  .cw-pressable {
    cursor: pointer;
    transition:
      transform var(--cw-duration-fast) var(--cw-ease),
      opacity var(--cw-duration-fast) var(--cw-ease);
    -webkit-tap-highlight-color: transparent;
  }

  .cw-pressable:active {
    transform: scale(0.97);
    opacity: 0.8;
  }

  :focus-visible {
    outline: 2px solid var(--cw-accent);
    outline-offset: 2px;
    border-radius: var(--cw-radius-inner);
  }

  /* Truncation helpers — widgets are small, text overflow is the norm. */
  .cw-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .cw-pressable {
      transition: none;
    }
    .cw-pressable:active {
      transform: none;
    }
  }
`
