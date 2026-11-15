/**
 * The geometry of the two watchOS faces this card adds to the plain ring, kept pure so the
 * arithmetic is a node test rather than a screenshot.
 *
 *  - **`gauge`** is the Lock Screen's `accessoryCircular` gauge: an arc open at the bottom, the
 *    reading in its middle and the glyph sitting in the gap — the shape a Watch's battery or
 *    UV-index complication takes.
 *  - **`bezel`** is the Graphic Bezel: a smaller ring in the middle and the complication's name
 *    running around the top of the rim, so the name needs no caption row of its own.
 *
 * Everything is in a 100-unit box, the same convention `core/ring.ts` uses for the plain ring,
 * with angles measured in degrees clockwise from twelve o'clock, which is how a watch face is
 * read rather than how trigonometry is.
 */

export const FACE_BOX = 100
const CENTRE = FACE_BOX / 2

/** The gauge's arc: 240°, open across the bottom third, as Apple's gauge is. */
export const GAUGE_START = -120
export const GAUGE_END = 120
export const GAUGE_RADIUS = 42
export const GAUGE_STROKE = 8

/** The bezel: the inner ring, and the radius the name's baseline runs along. */
export const BEZEL_RING_RADIUS = 30
export const BEZEL_RING_STROKE = 6
export const BEZEL_TEXT_RADIUS = 40
/** The span of rim the name may take, centred on twelve o'clock. */
export const BEZEL_TEXT_START = -110
export const BEZEL_TEXT_END = 110

const round = (n: number): number => Math.round(n * 100) / 100

/** The point at `angle` degrees clockwise from twelve o'clock, on a circle of `radius`. */
export const pointAt = (angle: number, radius: number): { x: number; y: number } => {
  const radians = (angle * Math.PI) / 180
  return {
    x: round(CENTRE + radius * Math.sin(radians)),
    y: round(CENTRE - radius * Math.cos(radians)),
  }
}

/**
 * An SVG path along the circle from `start` to `end`, clockwise. Drawn with `pathLength="100"`
 * by the card, so a fraction becomes a dash length without anyone measuring the arc.
 */
export const arcPath = (start: number, end: number, radius: number): string => {
  const from = pointAt(start, radius)
  const to = pointAt(end, radius)
  const large = end - start > 180 ? 1 : 0
  return `M${from.x} ${from.y} A${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`
}

/** Where the gauge's marker sits for a fraction, clamped to the arc. */
export const gaugeAngle = (fraction: number): number =>
  GAUGE_START + Math.min(1, Math.max(0, fraction)) * (GAUGE_END - GAUGE_START)

/**
 * The longest name the rim can carry before it would run into the gap at the bottom: the arc
 * from `BEZEL_TEXT_START` to `BEZEL_TEXT_END` at `BEZEL_TEXT_RADIUS` is about 150 units, and an
 * uppercase caption at the bezel's size averages about seven a character with its tracking.
 */
export const BEZEL_TEXT_MAX = 20

/** The name as the rim prints it: trimmed, and cut with an ellipsis rather than off the arc. */
export const bezelText = (name: string, max = BEZEL_TEXT_MAX): string => {
  const text = name.trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Which corner of the card a corner-face cell hugs. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * The corner a cell takes: the left column is left, the right column right; the first row is
 * the top and every later row alternates, so two rows of two fill the card's four corners and a
 * third row starts again at the top of what is left. A lone entity takes the top left.
 */
export const cornerFor = (index: number, columns: number): Corner => {
  const column = columns === 1 ? 0 : index % 2
  const row = Math.floor(index / Math.max(1, columns))
  const vertical = row % 2 === 0 ? 'top' : 'bottom'
  return `${vertical}-${column === 0 ? 'left' : 'right'}` as Corner
}

/**
 * The corner arc's radius in the 100-unit box anchored to the cell's outer corner. Short of the
 * box's edge on purpose: the arc's ends stop 28 units in, which leaves the corner itself clear
 * for the reading and the name, the way an Infograph corner's text sits outside its gauge.
 */
export const CORNER_RADIUS = 72
export const CORNER_STROKE = 7

/**
 * The quarter-arc a corner cell's gauge runs along: a circle centred on the box's *inner*
 * corner, so it bows out towards the card's corner the way an Infograph corner gauge follows
 * the bezel. Drawn in the direction it fills — up from the inner end on the left-hand corners,
 * mirrored on the right — so the four gauges of a full card read as a symmetrical set.
 */
export const cornerArc = (corner: Corner, radius = CORNER_RADIUS): string => {
  const r = radius
  switch (corner) {
    case 'top-left':
      return `M${100 - r} 100 A${r} ${r} 0 0 1 100 ${100 - r}`
    case 'top-right':
      return `M${r} 100 A${r} ${r} 0 0 0 0 ${100 - r}`
    case 'bottom-left':
      return `M${100 - r} 0 A${r} ${r} 0 0 0 100 ${r}`
    default:
      return `M${r} 0 A${r} ${r} 0 0 1 0 ${r}`
  }
}
