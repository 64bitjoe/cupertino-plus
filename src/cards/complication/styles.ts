/**
 * The complication card's stylesheet, moved out of `complication-card.ts` so the card file is
 * about behaviour. Every px is a design unit multiplied by `--cw-scale`; the five lengths that
 * `layout.ts` and `bento.ts` also price (`metrics.ts`) are interpolated from the one constant
 * rather than restated, so the arithmetic and the drawing cannot drift apart. `css` accepts a
 * number interpolation as-is (lit's own rule), so no `unsafeCSS` is needed for them.
 */

import { css } from 'lit'

import { GAP, GRAPH_MIN, INLINE_ROW, LABEL_GAP, RECT_BLOCK } from './metrics'

export const complicationStyles = css`
  /* Every px below is a design unit multiplied by --cw-scale, and layout.ts holds the
     same numbers unscaled: it divides the measured box by the factor instead, so the
     two sides of the arithmetic never restate each other. The lengths each price a
     twin in layout.ts are called out below, next to that twin's name there. The one
     exception is --cw-comp-ring: packFor answers it in the same design units as
     everything else, but the template sets it as a custom property CSS consumes
     directly, so it is scaled once, there, rather than restated as calc(var(--cw-
     comp-ring) * var(--cw-scale)) at every rule below that reads it -- the battery
     card's --cw-ring-size crosses the same boundary the same way, with the same
     comment, at battery-card.ts. */
  ha-card {
    height: 100%;
    box-sizing: border-box;
    padding: var(--cw-inset);
    display: flex;
  }

  /* rectangular-bleed only: the tint has to reach the card's own rounded corners, the
     way the Weather complication it copies does, so this is the one style that draws
     outside the padding every other style sits inside. The class comes off style
     itself, same as .grid's own class -- see .cell.rectangular-bleed below for why its
     border-radius has to change to match once the padding that used to hold it away
     from the corner is gone.

     layout.ts's floorsFor still charges 2*INSET for every rectangular style, bleed
     included -- it has no reason to special-case this one. That makes the floor it
     returns for a bleed card larger than what the CSS actually needs by 2*INSET, the
     same direction ASSUMED_SECTION_WIDTH already errs in: a generous floor, not a
     wrong one, so the Layout tab still never offers a box the card does not fit. */
  ha-card.rectangular-bleed {
    padding: 0;
  }

  .grid {
    flex: 1;
    display: grid;
    gap: var(--cw-comp-gap);
    min-width: 0;
  }

  /* GAP, from metrics.ts: the same number layout.ts and bento.ts price the grid with. */
  :host {
    --cw-comp-gap: calc(${GAP}px * var(--cw-scale));
  }

  /* justify-items: stretch, not place-items: center's shrink-to-content: a grid item
     sized to its own max-content can run wider than its 1fr track with nothing to
     clip it against, since grid does not reflow a track to make room for an
     overflowing neighbour — the visible symptom was a long caption overlapping the
     cell beside it rather than eliding. Stretching the cell to its column and
     centring within it via the flex column below (.cell's own align-items) gives the
     caption's overflow:hidden something the width of the actual column to truncate
     against. */
  .grid.circular,
  .grid.gauge,
  .grid.bezel {
    grid-template-columns: repeat(var(--cw-comp-columns), 1fr);
    align-items: center;
    justify-items: stretch;
  }

  /* One column, no track gap: the inline style separates its strips with a hairline
     border instead (see .cell.inline below), the same way layout.ts's floorsFor
     charges it no GAP term for the inline case. */
  .grid.inline {
    grid-template-columns: 1fr;
    gap: 0;
  }

  /* The rectangular family stacks one block per row, full width — packFor gives them
     all columns: 1, and floorsFor prices their floor the same way. */
  .grid.rectangular,
  .grid.rectangular-header,
  .grid.rectangular-bleed,
  .grid.rectangular-graph {
    grid-template-columns: 1fr;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* LABEL_GAP, from metrics.ts. */
    gap: calc(${LABEL_GAP}px * var(--cw-scale));
    cursor: pointer;
    min-width: 0;
  }

  /* The cell is the tap target, not the card: a card of six complications has no
     single subject for a click on empty grid space to open, and the battery card
     makes the same call for the same reason. */
  /* A cell with no action at all is information, not a control. */
  .cell.inert {
    cursor: default;
  }

  .cell:focus-visible {
    outline: 2px solid var(--cw-accent);
    outline-offset: 2px;
    border-radius: var(--cw-radius-inner);
  }

  .ring {
    position: relative;
    width: var(--cw-comp-ring);
    height: var(--cw-comp-ring);
    display: grid;
    place-items: center;
  }

  /* svg.gauge, not .gauge: the open-gauge face is called gauge too, and ha-card and the grid
     carry the style's name as a class. */
  svg.gauge {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .track {
    fill: none;
    stroke: var(--cw-track);
  }

  /* The tint, and it does not move with the reading: tint.ts's argument is that a
     complication's colour says what kind of thing it is, not how the reading is
     doing, so it is fixed per entity rather than stepped like a battery ring. */
  .arc {
    fill: none;
    stroke: var(--cw-comp-tint);
    stroke-linecap: round;
  }

  /* A running countdown slides between its once-a-second readings rather than stepping,
     the way the Timer complication's ring drains. Only there: a reading that changes when
     a sensor reports should land where it lands. */
  .arc.draining {
    transition: stroke-dasharray 1s linear;
  }

  .cell.counting .bar i {
    transition: width 1s linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .arc.draining,
    .cell.counting .bar i {
      transition: none;
    }
  }

  .reading {
    font-family: var(--cw-font);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    color: var(--cw-label);
    z-index: 1;
  }

  /* The ring's own reading, sized off the ring it actually landed in rather than off
     --cw-scale alone. A fixed 17px * scale read fine at packFor's default RING_MAX
     (96 design units) but not at RING_MIN (40): a 46% would touch the track on both
     sides, and a longer value like 21.4°C would wrap onto a second line the .ring box
     has no height budgeted for, spilling out of it and breaking the row beside it --
     both visible in docs/images/complication-small.png before this rule existed.
     white-space: nowrap is what .cell.inline .reading already carries for the same
     reason (see its own comment below): with the default 'normal' the reading wraps
     at its internal space rather than growing past its box, and a wrapped ring
     reading has nowhere to grow into. The clamp: a floor that stays legible at
     RING_MIN, a preferred size proportional to the ring's own diameter rather than a
     flat multiple of scale, and a ceiling at the 17px this rule always drew, so a
     ring at or above RING_MAX looks exactly as it did before this change. */
  .ring .reading {
    font-size: clamp(
      calc(11px * var(--cw-scale)),
      calc(var(--cw-comp-ring) * 0.2),
      calc(17px * var(--cw-scale))
    );
    line-height: 1.15;
    white-space: nowrap;
  }

  /* A countdown's short form: the number on the reading's own line, its unit on a small
     one underneath — the Watch's "4:18 / HR". */
  .reading.stacked {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
  }

  .reading .unit {
    font-size: clamp(
      calc(7px * var(--cw-scale)),
      calc(var(--cw-comp-ring) * 0.09),
      calc(11px * var(--cw-scale))
    );
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--cw-label-secondary);
    margin-top: calc(var(--cw-comp-ring) * 0.02);
  }

  /* var(--cw-text-caption-2), not a --cw-comp-label of its own: its 11px/13px is the
     LABEL layout.ts prices a captioned cell's height against, so the two already
     agree without this stylesheet inventing a second name for the same number. */
  .caption {
    font: var(--cw-text-caption-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--cw-label-secondary);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .glyph {
    color: var(--cw-comp-tint);
    --mdc-icon-size: calc(24px * var(--cw-scale));
  }

  /* Inline: one strip, hairline-separated when they stack. */
  .cell.inline {
    flex-direction: row;
    align-items: center;
    gap: calc(10px * var(--cw-scale));
    /* INLINE_ROW, from metrics.ts. */
    min-height: calc(${INLINE_ROW}px * var(--cw-scale));
  }

  .cell.inline + .cell.inline {
    border-top: 1px solid var(--cw-separator);
  }

  .cell.inline .name {
    font: 600 calc(15px * var(--cw-scale)) / calc(20px * var(--cw-scale)) var(--cw-font);
    color: var(--cw-label);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* white-space: nowrap for the same reason .name gets it: with the default 'normal',
     a narrow column does not overflow the reading, it wraps it at the space before
     the unit ('21.4' over '°C'), which grows the row past the 44px INLINE_ROW
     layout.ts charged for it. A reading is short enough that nowrap alone is enough
     room in practice; .name's ellipsis is what actually gives ground when a row is
     tight. */
  .cell.inline .reading {
    margin-left: auto;
    color: var(--cw-label-secondary);
    font-weight: 400;
    white-space: nowrap;
  }

  /* Nothing to say, said quietly — the battery card's rule for a dead sensor. */
  .cell.unknown .glyph {
    opacity: 0.4;
  }

  .cell.unknown .reading {
    color: var(--cw-label-secondary);
  }

  .empty {
    font: var(--cw-text-callout);
    color: var(--cw-label-secondary);
    margin: auto;
  }

  /* The rectangular family's shared shape: an icon-and-name head over a body carrying
     the reading, an optional supporting line, and an optional bar. rectangular wears
     this bare — tint only on the caption and the bar — and rectangular-header and
     rectangular-bleed below layer their own chrome on top of it. */
  .cell.block {
    flex-direction: column;
    align-items: stretch;
    gap: calc(4px * var(--cw-scale));
    /* RECT_BLOCK, from metrics.ts. */
    min-height: calc(${RECT_BLOCK}px * var(--cw-scale));
    border-radius: var(--cw-radius-inner);
    overflow: hidden;
  }

  .cell.block .head {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--cw-scale));
    min-width: 0;
  }

  .cell.block .name {
    font: var(--cw-text-caption-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--cw-comp-tint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell.block .body {
    display: flex;
    flex-direction: column;
    gap: calc(3px * var(--cw-scale));
    flex: 1;
  }

  .cell.block .reading {
    font: var(--cw-text-title-1);
    letter-spacing: -0.02em;
    color: var(--cw-label);
  }

  .cell.block .support {
    font: var(--cw-text-subheadline);
    color: var(--cw-label-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell.block .bar {
    margin-top: auto;
    height: calc(5px * var(--cw-scale));
    border-radius: var(--cw-radius-pill);
    background: var(--cw-track);
    overflow: hidden;
  }

  .cell.block .bar i {
    display: block;
    height: 100%;
    background: var(--cw-comp-tint);
  }

  .cell.block .glyph {
    color: var(--cw-comp-tint);
    --mdc-icon-size: calc(14px * var(--cw-scale));
  }

  /* .cell.unknown .reading above and .cell.block .reading are both three-class
     selectors, so which one wins is decided by source order rather than by meaning —
     and a rule declared later in this file would silently un-dim an unavailable
     reading again. .block.unknown is four classes, so it beats both outright,
     whatever else here gets reordered. This is what keeps model.ts's rule true on
     the two block faces that colour their reading from --cw-label (plain
     rectangular and rectangular-header): an entity that has gone unavailable is
     never dropped, it is drawn dashed and dimmed, same as circular and inline draw
     it. rectangular-bleed colours its reading from --cw-comp-on-tint instead, so it
     gets its own version of this rule further down, once on-tint is in scope. */
  .cell.block.unknown .reading {
    color: var(--cw-label-secondary);
  }

  /* The Notes treatment: the strip carries the identity, the body gets the story. */
  .cell.rectangular-header {
    gap: 0;
    background: var(--cw-fill);
  }

  .cell.rectangular-header .head {
    background: var(--cw-comp-tint);
    padding: calc(8px * var(--cw-scale)) calc(12px * var(--cw-scale));
  }

  /* var(--cw-comp-on-tint), not a bare white: see onTintVar's comment in the .ts file
     for why four of the eleven tints need something other than white here. */
  .cell.rectangular-header .head .name,
  .cell.rectangular-header .head .glyph {
    color: var(--cw-comp-on-tint);
    font-size: calc(14px * var(--cw-scale));
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
  }

  .cell.rectangular-header .head .glyph {
    --mdc-icon-size: calc(16px * var(--cw-scale));
  }

  .cell.rectangular-header .body {
    padding: calc(10px * var(--cw-scale)) calc(12px * var(--cw-scale));
  }

  .cell.rectangular-header .reading {
    font: var(--cw-text-title-3);
  }

  /* The Weather treatment: the tint IS the card. Content is drawn in
     var(--cw-comp-on-tint) in both themes, because the surface under it is the tint
     rather than the theme's, so the theme's own label colour would be unreadable half
     the time no matter which colour it read as. The overlay is what keeps the gradient
     from glowing in dark mode, and it is a card-local overlay rather than a change to
     --cw-surface: full-bleed is the one face in the library that replaces the user's
     theme surface with the tint on purpose, and that is a once-per-cell decision this
     style makes for itself, not something the rest of the card should inherit.

     border-radius: var(--cw-radius), not the inner radius .cell.block set above (this
     rule wins the tie: same two-class specificity, later in the sheet). --cw-radius-
     inner is right for a panel that sits inside the card's own padding, which is what
     every other rectangular face still is; with ha-card's padding removed above, this
     one block IS the card's face, so its corners have to agree with the outer radius
     ha-card itself draws with, or the two curves show as a mismatched notch at every
     corner. Stacked blocks each keep all four corners rounded and stay separated by
     the grid's own gap between cells (unchanged, still var(--cw-comp-gap)) rather than
     a card-coloured margin of their own: every block spans full width, so its left and
     right edges always meet ha-card's, while only the first block's top edge and the
     last block's bottom edge meet ha-card's top and bottom -- an interior block floats
     between two gaps, rounded on all four corners like the single-entity case. */
  .cell.rectangular-bleed {
    background-image: linear-gradient(150deg, var(--cw-comp-tint), var(--cw-comp-tint));
    background-color: var(--cw-comp-tint);
    padding: calc(14px * var(--cw-scale));
    border-radius: var(--cw-radius);
    position: relative;
  }

  .cell.rectangular-bleed::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(150deg, rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.22));
    pointer-events: none;
  }

  :host([dark]) .cell.rectangular-bleed::after {
    background: linear-gradient(150deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.05));
  }

  .cell.rectangular-bleed .name,
  .cell.rectangular-bleed .reading,
  .cell.rectangular-bleed .glyph {
    color: var(--cw-comp-on-tint);
    position: relative;
    z-index: 1;
  }

  .cell.rectangular-bleed .name {
    text-transform: none;
    letter-spacing: 0;
    font: 600 calc(14px * var(--cw-scale)) / calc(18px * var(--cw-scale)) var(--cw-font);
  }

  .cell.rectangular-bleed .reading {
    font: 500 calc(38px * var(--cw-scale)) / calc(40px * var(--cw-scale)) var(--cw-font);
  }

  /* 92% of on-tint rather than a second colour: the same softened weight the header
     chrome gives a secondary line, whichever of the two on-tint colours this tint got. */
  .cell.rectangular-bleed .support {
    color: color-mix(in srgb, var(--cw-comp-on-tint) 92%, transparent);
    position: relative;
    z-index: 1;
  }

  /* The sparkline. The stroke and the fill are the tint, except on the bleed face, where
     the surface IS the tint and the line has to be on-tint ink instead. */
  .spark {
    --cw-spark: var(--cw-comp-tint);
    position: relative;
    min-width: 0;
    animation: cw-spark-in var(--cw-duration) var(--cw-ease-out) both;
  }

  .spark svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .spark .line {
    fill: none;
    stroke: var(--cw-spark);
    stroke-width: calc(1.75px * var(--cw-scale));
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .spark .stop-top {
    stop-color: var(--cw-spark);
    stop-opacity: 0.28;
  }

  .spark .stop-bottom {
    stop-color: var(--cw-spark);
    stop-opacity: 0;
  }

  /* Now: a dot ringed in the surface colour, the Stocks widget's marker. */
  .spark .dot {
    position: absolute;
    width: calc(6px * var(--cw-scale));
    height: calc(6px * var(--cw-scale));
    margin: calc(-3px * var(--cw-scale)) 0 0 calc(-3px * var(--cw-scale));
    border-radius: 50%;
    background: var(--cw-spark);
    box-shadow: 0 0 0 calc(1.5px * var(--cw-scale))
      var(--cw-surface, var(--card-background-color, #fff));
  }

  .cell.rectangular-bleed .spark {
    --cw-spark: var(--cw-comp-on-tint);
    z-index: 1;
  }

  .cell.rectangular-bleed .spark .dot {
    box-shadow: none;
  }

  /* Beside the reading on the block faces, taking whatever width the reading leaves. */
  .cell.block .reading-row {
    display: flex;
    align-items: center;
    gap: calc(12px * var(--cw-scale));
    min-width: 0;
  }

  .cell.block .reading-row .reading {
    flex: none;
    white-space: nowrap;
  }

  .spark.block {
    flex: 1;
    height: calc(28px * var(--cw-scale));
    max-width: calc(160px * var(--cw-scale));
    margin-left: auto;
    /* Room for the half of the dot that sits past the line's end. */
    margin-right: calc(4px * var(--cw-scale));
  }

  /* Inline: a short stroke just before the reading, the Stocks list's shape. */
  .spark.inline {
    flex: none;
    width: calc(44px * var(--cw-scale));
    height: calc(16px * var(--cw-scale));
    margin-left: auto;
    margin-right: calc(4px * var(--cw-scale));
  }

  .spark.inline + .reading {
    margin-left: 0;
  }

  @keyframes cw-spark-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spark {
      animation: none;
    }
  }

  /* The graph face reflows into side-by-side mini graphs when stacking cannot give each one
     room for its line (layout.ts's packGraph); every row shares the height evenly. */
  .grid.rectangular-graph {
    grid-template-columns: repeat(var(--cw-comp-columns), minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    /* Held to the card's own height, so the rows share what is there instead of growing to
       their content and pushing the last graph out of the bottom. */
    height: 100%;
    min-height: 0;
  }

  .grid.compact .cell.rectangular-graph .reading {
    font: var(--cw-text-title-2, var(--cw-text-title-1));
    letter-spacing: -0.02em;
  }

  /* The corner face: a square anchored to the cell's outer corner holds the arc, and the text
     is set inside it, pushed toward that same corner. */
  .grid.corner {
    grid-template-columns: repeat(var(--cw-comp-columns), minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }

  .cell.corner-face {
    position: relative;
    display: block;
    min-height: 0;
    container-type: size;
  }

  .corner-gauge {
    position: absolute;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    overflow: visible;
  }

  .corner-gauge .track {
    fill: none;
    stroke: var(--cw-track);
  }

  .corner-text {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: calc(2px * var(--cw-scale));
    min-width: 0;
    /* The arc's inner end crosses the name's line about 30% in from the square's inner
       edge, so the text stops short of it and a long name ellipsizes instead. */
    max-width: calc(min(100cqw, 100cqh) * 0.7);
    overflow: hidden;
  }

  .corner-text > * {
    max-width: 100%;
  }

  .corner-text .reading {
    font-size: clamp(
      calc(15px * var(--cw-scale)),
      calc(min(100cqw, 100cqh) * 0.2),
      calc(30px * var(--cw-scale))
    );
    line-height: 1.05;
    white-space: nowrap;
  }

  .corner-name {
    display: flex;
    align-items: center;
    gap: calc(4px * var(--cw-scale));
    font: var(--cw-text-caption-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--cw-label-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .corner-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .corner-name .glyph {
    flex: none;
    --mdc-icon-size: calc(13px * var(--cw-scale));
  }

  .top-left .corner-gauge {
    top: 0;
    left: 0;
  }
  .top-right .corner-gauge {
    top: 0;
    right: 0;
  }
  .bottom-left .corner-gauge {
    bottom: 0;
    left: 0;
  }
  .bottom-right .corner-gauge {
    bottom: 0;
    right: 0;
  }

  /* In the corner itself, outside the arc — where an Infograph corner sets its reading, with
     the gauge curving past it along the bezel. */
  .top-left .corner-text {
    top: 0;
    left: 0;
  }
  .top-right .corner-text {
    top: 0;
    right: 0;
    align-items: flex-end;
    text-align: right;
  }
  .bottom-left .corner-text {
    bottom: 0;
    left: 0;
  }
  .bottom-right .corner-text {
    bottom: 0;
    right: 0;
    align-items: flex-end;
    text-align: right;
  }

  .corner-text .reading.stacked {
    flex-direction: row;
  }

  /* Bento: the card draws no panel at all; each cell is its own surface on the container's
     paint — the glass a tile wears, or the theme's own card. */
  ha-card.bento {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    overflow: visible;
  }

  .grid.bento {
    grid-template-columns: repeat(var(--cw-bento-columns), minmax(0, 1fr));
    grid-template-rows: repeat(var(--cw-bento-rows), minmax(0, 1fr));
    height: 100%;
    min-height: 0;
  }

  .bento-cell {
    display: flex;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    padding: var(--cw-inset);
    border-radius: var(--cw-radius);
    overflow: hidden;
    position: relative;
  }

  .bento-cell.glass {
    background: var(--cw-glass-fill);
    box-shadow: inset 0 0 0 1px var(--cw-glass-ring);
    -webkit-backdrop-filter: var(--cw-glass-filter);
    backdrop-filter: var(--cw-glass-filter);
  }

  .bento-cell.solid {
    background: var(--cw-surface);
    border: var(--ha-card-border-width, 1px) solid
      var(--ha-card-border-color, var(--divider-color, transparent));
    box-shadow: var(--ha-card-box-shadow, none);
  }

  /* The full-bleed face is the cell's surface: it fills the cell to its rounded edge. */
  .bento-cell.bleed {
    padding: 0;
    background: none;
    box-shadow: none;
    border: none;
  }

  .bento-cell > .grid {
    flex: 1;
    min-height: 0;
    height: 100%;
  }

  /* A cell is as big as the grid made it; a face inside it never asks for more. */
  .bento-cell .cell.block {
    min-height: 0;
  }

  /* The open gauge. The marker is a dot in the surface colour ringed by the tint, sitting
     where the fill ends: the Lock Screen gauge's indicator. */
  .gauge-face .track {
    fill: none;
  }

  .gauge-face .marker {
    fill: var(--cw-surface);
    stroke: var(--cw-comp-tint);
    stroke-width: 2.5;
  }

  .cell.unknown .marker {
    display: none;
  }

  .gauge-face .reading {
    margin-top: -8%;
  }

  /* The glyph sits in the gap at the bottom of the arc. */
  .gauge-face .glyph.gap {
    position: absolute;
    bottom: 2%;
    left: 50%;
    transform: translateX(-50%);
    --mdc-icon-size: calc(var(--cw-comp-ring) * 0.2);
  }

  /* The bezel: the name in the tint around the rim, the ring and reading inside it. */
  .bezel-text {
    fill: var(--cw-comp-tint);
    font-family: var(--cw-font);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .cell.unknown .bezel-text {
    fill: var(--cw-label-secondary);
  }

  .bezel-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--cw-comp-ring) * 0.02);
    z-index: 1;
  }

  .bezel-face .reading {
    font-size: clamp(
      calc(9px * var(--cw-scale)),
      calc(var(--cw-comp-ring) * 0.15),
      calc(17px * var(--cw-scale))
    );
    white-space: nowrap;
  }

  .bezel-face .glyph {
    --mdc-icon-size: calc(var(--cw-comp-ring) * 0.2);
  }

  /* The graph face: the bare rectangle's chrome, with the history filling the body. */
  .cell.rectangular-graph {
    /* GRAPH_MIN, from metrics.ts: the least a graph block may be. */
    min-height: calc(${GRAPH_MIN}px * var(--cw-scale));
  }

  /* A cell too narrow for the high and low keeps them for VoiceOver only. */
  .grid.compact .cell.rectangular-graph .extremes {
    display: none;
  }

  .cell.rectangular-graph .reading-row {
    align-items: baseline;
    justify-content: space-between;
  }

  .cell.rectangular-graph .extremes {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font: var(--cw-text-caption-1, var(--cw-text-caption-2));
    font-variant-numeric: tabular-nums;
    color: var(--cw-label-secondary);
    white-space: nowrap;
  }

  /* The graph's box takes whatever height its cell leaves, and the SVG fills it absolutely,
     so its own 100×32 aspect ratio never asks the row for more room than it has. */
  .cell.rectangular-graph .body {
    min-height: 0;
  }

  .spark.graph svg {
    position: absolute;
    inset: 0;
  }

  .spark.graph {
    flex: 1 1 0;
    min-height: calc(24px * var(--cw-scale));
    margin: calc(4px * var(--cw-scale)) calc(4px * var(--cw-scale)) 0 0;
  }

  /* rectangular-bleed's own version of .cell.block.unknown .reading above: that
     rule dims to --cw-label-secondary, which is picked for the surface behind
     circular/inline/the other two block faces, not for whatever --cw-comp-tint this
     card just became — grey theme text over a saturated tint reads as a colour
     clash, not as quiet. Dimmed the same way the rest of the library steps a
     primary down to a secondary instead: 60% opacity is the exact alpha
     --cw-label-secondary already carries against --cw-label in tokens.ts, in both
     themes, so this reading dims by the same ratio as every other face's — just
     applied to on-tint ink, the only ink that is ever legible on this face's
     background. Declared after .cell.rectangular-bleed .support so it also beats
     .cell.block.unknown .reading (both four classes, tie broken by source order)
     on a cell that carries both .block and .rectangular-bleed. */
  .cell.rectangular-bleed.unknown .reading {
    color: color-mix(in srgb, var(--cw-comp-on-tint) 60%, transparent);
  }
`
