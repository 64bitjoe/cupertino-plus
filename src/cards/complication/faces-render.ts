/**
 * The faces themselves: one function per face, each taking the item to draw and the card's
 * `FaceContext` — the cell wrapper (tint, press handlers, VoiceOver label) and the sparkline
 * geometry, which only the card can supply because it owns the gestures and the history feed.
 *
 * Moved out of `complication-card.ts`, which keeps the clocks, the gestures and the layout; what
 * is here is markup, and every face is drawn by exactly one function below.
 */

import { html, nothing, svg, type TemplateResult } from 'lit'

import { RING_BOX, RING_CIRCUMFERENCE, RING_RADIUS, RING_STROKE } from '../../core/ring'
import {
  arcPath,
  bezelText,
  BEZEL_RING_RADIUS,
  BEZEL_RING_STROKE,
  BEZEL_TEXT_END,
  BEZEL_TEXT_RADIUS,
  BEZEL_TEXT_START,
  cornerArc,
  cornerFor,
  CORNER_STROKE,
  FACE_BOX,
  gaugeAngle,
  GAUGE_END,
  GAUGE_RADIUS,
  GAUGE_START,
  GAUGE_STROKE,
  pointAt,
  type Corner,
} from './faces'
import type { SparklineGeometry } from './history'
import type { Pack } from './layout'
import type { Complication } from './model'
import { isRectangular, type ComplicationStyle } from './style'

/** What a face needs from the card it is drawn in. */
export interface FaceContext {
  /**
   * The cell every face draws inside: one element carrying the tint, the press handlers and the
   * VoiceOver label, so no face can forget one of them.
   */
  cell(
    item: Complication,
    classes: string,
    content: TemplateResult,
    spoken?: string,
  ): TemplateResult
  /** The item's sparkline, or `null` when there is none to draw (yet). */
  geometry(item: Complication): SparklineGeometry | null
  /** The window's low and high, in the entity's own precision and unit. */
  extremes(item: Complication, geometry: SparklineGeometry): { low: string; high: string }
}

/** The spoken half of a sparkline: the window's range, since a line cannot be read aloud. */
export function spokenTrend(
  item: Complication,
  geometry: SparklineGeometry | null,
  ctx: FaceContext,
): string {
  const reading = item.countdown?.spoken ?? item.value
  if (!geometry) return reading
  const { low, high } = ctx.extremes(item, geometry)
  return `${reading}, between ${low} and ${high} over the last ${item.history ?? 24} hours`
}

/**
 * The line itself: a soft fill fading to nothing under a stroke in the tint, and a dot where
 * it ends — now. The box stretches to its container (`preserveAspectRatio="none"`), so the
 * stroke is kept a true hairline with `vector-effect` and the dot is HTML, positioned by
 * fraction, so it stays round however wide the line is drawn.
 *
 * `index` keeps the gradient ids unique within the card's shadow root.
 */
export function renderSparkline(
  geometry: SparklineGeometry,
  index: number,
  variant: 'inline' | 'block' | 'graph',
): TemplateResult {
  const id = `cw-spark-${index}`
  return html`
    <div class="spark ${variant}" aria-hidden="true">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <defs>
          ${svg`<linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
            <stop class="stop-top" offset="0" />
            <stop class="stop-bottom" offset="1" />
          </linearGradient>`}
        </defs>
        ${svg`<path class="area" d=${geometry.area} fill=${`url(#${id})`} />`}
        ${svg`<path class="line" d=${geometry.line} vector-effect="non-scaling-stroke" />`}
      </svg>
      <i class="dot" style=${`left:${geometry.end.x * 100}%; top:${geometry.end.y * 100}%`}></i>
    </div>
  `
}

/**
 * The gauge, in the ring's own coordinate space; `ring.ts` has the arithmetic.
 *
 * Drawn with lit's **`svg`** tag for the arc circle, not `html`. A nested lit template
 * is parsed on its own, so an `html` one would create that circle in the HTML
 * namespace: it would still land in the DOM with every attribute set, but every
 * *presentation* attribute would be silently ignored — `stroke-width` reading back as
 * 1px, `stroke-dasharray` as `none` — and the card would draw a bare track at every
 * level with nothing anywhere to say why. The battery card hits the same trap and
 * explains it the same way.
 *
 * The group is turned −90° because an SVG circle starts at three o'clock; from there
 * the dash runs clockwise, the direction the watch face fills in.
 */
export function renderRing(item: Complication): TemplateResult {
  const centre = RING_BOX / 2
  const arc = item.fraction === null ? 0 : item.fraction * RING_CIRCUMFERENCE

  return html`
    <svg class="gauge" viewBox="0 0 ${RING_BOX} ${RING_BOX}" aria-hidden="true">
      <g transform="rotate(-90 ${centre} ${centre})">
        <circle
          class="track"
          cx=${centre}
          cy=${centre}
          r=${RING_RADIUS}
          stroke-width=${RING_STROKE}
        />
        ${
          arc > 0
            ? svg`<circle
                class="arc ${item.countdown?.ticking ? 'draining' : ''}"
                cx=${centre}
                cy=${centre}
                r=${RING_RADIUS}
                stroke-width=${RING_STROKE}
                stroke-dasharray=${`${arc} ${RING_CIRCUMFERENCE}`}
              />`
            : nothing
        }
      </g>
    </svg>
  `
}

/**
 * The circular face: a ring around a reading, or an icon beside one when there is no
 * range to draw the ring against.
 *
 * `range.ts` returns `null` for most entities — a temperature has no ceiling to gauge
 * against — and drawing an empty ring in that case would be a fraction of nothing,
 * which reads worse than no gauge at all. So the icon takes the ring's place instead:
 * the same style showing what the data supports, rather than a sixth style for entities
 * with no range.
 *
 * The `aria-label` here, and on the other two faces below, spells "unavailable" out
 * rather than reading `item.value` straight: `model.ts` already turns an unreadable
 * entity's value into an em dash for the dashed, dimmed cell decision 4 draws visually,
 * but an em dash read aloud by a screen reader is silence, not a dash — "Lounge
 * Humidity, —" tells nobody anything went wrong. `battery-card.ts`'s cells make the
 * same call the same way, off the same `unknown`/`unavailable` flag.
 */
/**
 * The reading inside a ring. A countdown prints its short form — `4:18` over a small `HR` —
 * because `4h 18m` on one line is wider than the inside of a small ring; everything else
 * prints as it always did. The unit line is `aria-hidden`: the cell's label already says it.
 */
export function ringReading(item: Complication): TemplateResult {
  const short = item.countdown?.short
  if (!short) return html`<span class="reading">${item.value}</span>`
  return html`<span class="reading stacked"
    >${short.main}${
      short.unit ? html`<small class="unit" aria-hidden="true">${short.unit}</small>` : nothing
    }</span
  >`
}

export function renderCircular(
  item: Complication,
  labels: boolean,
  ctx: FaceContext,
): TemplateResult {
  // A countdown is a gauge with no range of its own: it drains rather than fills.
  const gauge = item.range !== null || item.countdown !== null

  return ctx.cell(
    item,
    'circular',
    html`
      <div class="ring">
        ${gauge ? renderRing(item) : nothing}
        ${
          gauge
            ? ringReading(item)
            : html`
                <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
                <span class="reading">${item.value}</span>
              `
        }
      </div>
      ${labels ? html`<span class="caption">${item.name}</span>` : nothing}
    `,
    item.countdown?.spoken,
  )
}

/**
 * The three rectangular faces, which differ only in how much colour they wear: a tint
 * on the caption and the bar, a tinted header strip, or the tint as the whole card. One
 * markup shape, three stylesheets, because they say the same things in the same order —
 * name and icon, reading, supporting line, bar — and only the chrome around them moves.
 *
 * The bar is suppressed on `rectangular-header`: the strip already carries the identity
 * (icon and name), which is what a fraction bar exists to summon attention toward on the
 * other two faces, so drawing one under the body as well would be repeating a cue the
 * header just gave. `item.fraction` still gates it on the other two, same as everywhere
 * else in this card — no fraction, no bar, whatever the style.
 */
export function renderRectangular(
  style: ComplicationStyle,
  item: Complication,
  index: number,
  ctx: FaceContext,
): TemplateResult {
  const header = style === 'rectangular-header'
  const geometry = ctx.geometry(item)

  return ctx.cell(
    item,
    `block ${style}`,
    html`
      <div class="head">
        <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
        <span class="name">${item.name}</span>
      </div>
      <div class="body">
        ${
          geometry
            ? html`<div class="reading-row">
                <span class="reading">${item.value}</span>
                ${renderSparkline(geometry, index, 'block')}
              </div>`
            : html`<span class="reading">${item.value}</span>`
        }
        ${item.supporting ? html`<span class="support">${item.supporting}</span>` : nothing}
        ${
          // The header face draws no bar for a reading, but a countdown's draining bar is
          // its whole gauge, so a countdown keeps it.
          item.fraction !== null && (!header || item.countdown !== null)
            ? html`<div class="bar"><i style=${`width:${item.fraction * 100}%`}></i></div>`
            : nothing
        }
      </div>
    `,
    spokenTrend(item, geometry, ctx),
  )
}

/** The inline face: one line, an icon, a name and a reading, meant to sit among other
 * inline complications rather than to occupy a cell of its own. */
export function renderInline(item: Complication, index: number, ctx: FaceContext): TemplateResult {
  const geometry = ctx.geometry(item)
  return ctx.cell(
    item,
    'inline',
    html`
      <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
      <span class="name">${item.name}</span>
      ${geometry ? renderSparkline(geometry, index, 'inline') : nothing}
      <span class="reading">${item.value}</span>
    `,
    spokenTrend(item, geometry, ctx),
  )
}

/**
 * One entity, in whichever of the eight faces `style` names.
 *
 * `inline` and the rectangular family each have a face of their own; `circular` is
 * both a face and the fallback, so a style this switch does not recognise (there is
 * none today, but a future style added to `COMPLICATION_STYLES` without a branch here
 * yet) still draws something rather than nothing.
 */
export function renderCell(
  style: ComplicationStyle,
  item: Complication,
  pack: Pack,
  index: number,
  ctx: FaceContext,
): TemplateResult {
  const labels = pack.labels
  if (style === 'corner') return renderCorner(item, cornerFor(index, pack.columns), ctx)
  if (style === 'inline') return renderInline(item, index, ctx)
  if (style === 'rectangular-graph') return renderGraph(item, index, ctx)
  if (isRectangular(style)) return renderRectangular(style, item, index, ctx)
  if (style === 'gauge') return renderGauge(item, labels, ctx)
  if (style === 'bezel') return renderBezel(item, ctx)
  return renderCircular(item, labels, ctx)
}

/**
 * The corner face: watchOS's Infograph corner, in a grid cell. A quarter-arc gauge bows out
 * towards the card's own corner, and the reading and glyph sit inside it, aligned to that
 * corner — so a card of four reads as one face with a complication in each corner. The arc is
 * drawn in a square box anchored to the cell's outer corner, so it stays a true circle however
 * the cell is proportioned. With no range or countdown, the arc is not drawn and the glyph and
 * reading stand alone in the corner.
 */
export function renderCorner(item: Complication, corner: Corner, ctx: FaceContext): TemplateResult {
  const gauge = item.range !== null || item.countdown !== null
  const fraction = item.fraction ?? 0
  const path = cornerArc(corner)
  const short = item.countdown?.short

  return ctx.cell(
    item,
    `corner-face ${corner}`,
    html`
      ${
        gauge
          ? html`<svg class="corner-gauge" viewBox="0 0 100 100" aria-hidden="true">
              ${svg`<path class="track" d=${path} stroke-width=${CORNER_STROKE} stroke-linecap="round" />`}
              ${
                fraction > 0
                  ? svg`<path
                      class="arc ${item.countdown?.ticking ? 'draining' : ''}"
                      d=${path}
                      pathLength="100"
                      stroke-width=${CORNER_STROKE}
                      stroke-dasharray=${`${fraction * 100} 100`}
                    />`
                  : nothing
              }
            </svg>`
          : nothing
      }
      <div class="corner-text">
        <span class="reading"
          >${short ? short.main : item.value}${
            short?.unit
              ? html`<small class="unit" aria-hidden="true"> ${short.unit}</small>`
              : nothing
          }</span
        >
        <span class="corner-name"
          ><ha-icon class="glyph" .icon=${item.icon}></ha-icon
          ><span class="corner-label">${item.name}</span></span
        >
      </div>
    `,
    item.countdown?.spoken,
  )
}

/**
 * The open gauge: Apple's `accessoryCircular` gauge. A 240° arc with the reading in its middle
 * and the glyph in the gap at the bottom, filled to the fraction with a ringed marker where
 * the fill ends. Without a range (or a countdown) there is nothing to gauge, and the face
 * draws what `circular` draws then: the glyph and the reading.
 */
export function renderGauge(item: Complication, labels: boolean, ctx: FaceContext): TemplateResult {
  if (item.range === null && item.countdown === null) return renderCircular(item, labels, ctx)

  const fraction = item.fraction ?? 0
  const track = arcPath(GAUGE_START, GAUGE_END, GAUGE_RADIUS)
  const marker = pointAt(gaugeAngle(fraction), GAUGE_RADIUS)

  return ctx.cell(
    item,
    'circular gauge-face',
    html`
      <div class="ring">
        <svg class="gauge" viewBox="0 0 ${FACE_BOX} ${FACE_BOX}" aria-hidden="true">
          ${svg`<path class="track" d=${track} stroke-width=${GAUGE_STROKE} stroke-linecap="round" />`}
          ${
            fraction > 0
              ? svg`<path
                  class="arc ${item.countdown?.ticking ? 'draining' : ''}"
                  d=${track}
                  pathLength="100"
                  stroke-width=${GAUGE_STROKE}
                  stroke-dasharray=${`${fraction * 100} 100`}
                />`
              : nothing
          }
          ${svg`<circle class="marker" cx=${marker.x} cy=${marker.y} r=${GAUGE_STROKE / 2 + 1} />`}
        </svg>
        ${ringReading(item)}
        <ha-icon class="glyph gap" .icon=${item.icon}></ha-icon>
      </div>
      ${labels ? html`<span class="caption">${item.name}</span>` : nothing}
    `,
    item.countdown?.spoken,
  )
}

/**
 * The Graphic Bezel: the name runs around the top of the rim, and a smaller ring (or the
 * glyph, with no range to draw) sits inside it with the reading. The name is on a `textPath`,
 * so it curves with the rim at any size, and is cut short by `bezelText` rather than by the
 * arc running out.
 */
export function renderBezel(item: Complication, ctx: FaceContext): TemplateResult {
  const gauge = item.range !== null || item.countdown !== null
  const fraction = item.fraction ?? 0
  const id = `cw-bezel-${item.id.replace(/[^\w-]/g, '_')}`

  return ctx.cell(
    item,
    'circular bezel-face',
    html`
      <div class="ring">
        <svg class="gauge" viewBox="0 0 ${FACE_BOX} ${FACE_BOX}" aria-hidden="true">
          <defs>
            ${svg`<path id=${id} d=${arcPath(BEZEL_TEXT_START, BEZEL_TEXT_END, BEZEL_TEXT_RADIUS)} />`}
          </defs>
          ${svg`<text class="bezel-text"><textPath href=${`#${id}`} startOffset="50%" text-anchor="middle">${bezelText(item.name).toUpperCase()}</textPath></text>`}
          ${
            gauge
              ? svg`<circle class="track" cx="50" cy="50" r=${BEZEL_RING_RADIUS} stroke-width=${BEZEL_RING_STROKE} />
                ${
                  fraction > 0
                    ? svg`<circle
                        class="arc ${item.countdown?.ticking ? 'draining' : ''}"
                        cx="50"
                        cy="50"
                        r=${BEZEL_RING_RADIUS}
                        pathLength="100"
                        transform="rotate(-90 50 50)"
                        stroke-width=${BEZEL_RING_STROKE}
                        stroke-dasharray=${`${fraction * 100} 100`}
                      />`
                    : nothing
                }`
              : nothing
          }
        </svg>
        <div class="bezel-inner">
          ${gauge ? nothing : html`<ha-icon class="glyph" .icon=${item.icon}></ha-icon>`}
          ${gauge ? ringReading(item) : html`<span class="reading">${item.value}</span>`}
        </div>
      </div>
    `,
    item.countdown?.spoken,
  )
}

/**
 * The graph face: the Watch's graphic rectangular complication with a chart. The name over
 * the reading, the window's high and low beside it, and the history filling the rest. It draws
 * its graph whatever the `sparkline` switch says — the graph is what the face is — and, for a
 * reading with no history to draw (a word, a countdown), falls back to the bar or nothing.
 */
export function renderGraph(item: Complication, index: number, ctx: FaceContext): TemplateResult {
  const geometry = ctx.geometry(item)
  const extremes = geometry ? ctx.extremes(item, geometry) : null

  return ctx.cell(
    item,
    'block rectangular rectangular-graph',
    html`
      <div class="head">
        <ha-icon class="glyph" .icon=${item.icon}></ha-icon>
        <span class="name">${item.name}</span>
      </div>
      <div class="body">
        <div class="reading-row">
          <span class="reading">${item.value}</span>
          ${
            extremes
              ? html`<span class="extremes">
                  <span>H ${extremes.high}</span><span>L ${extremes.low}</span>
                </span>`
              : item.supporting
                ? html`<span class="support">${item.supporting}</span>`
                : nothing
          }
        </div>
        ${
          geometry
            ? renderSparkline(geometry, index, 'graph')
            : item.fraction !== null
              ? html`<div class="bar"><i style=${`width:${item.fraction * 100}%`}></i></div>`
              : nothing
        }
      </div>
    `,
    spokenTrend(item, geometry, ctx),
  )
}
