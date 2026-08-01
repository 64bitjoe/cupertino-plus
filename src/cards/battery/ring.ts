/**
 * The arc, as arithmetic.
 *
 * Everything here is in the ring's own coordinate space rather than in pixels, and that is
 * what keeps `layout.ts` and this file from having to agree about anything: the SVG carries
 * a `viewBox` of `RING_BOX` square and is drawn at whatever diameter the grid worked out,
 * so the stroke and the arc scale with the ring for free and `--cw-scale` never enters into
 * it. The one number the two files share is the diameter, and it travels as a CSS length.
 *
 * **The ring is always green.** Not amber at 20 and not red at 5, and this is the design
 * being copied rather than an omission: the level is read off the length of the arc, which
 * is a quantity, and a colour that changed underneath it would be a second, coarser reading
 * of the same number: one that says "low" at 19% and "fine" at 21% when the arc has
 * already said 19 and 21. A widget of six devices in three colours also stops being a
 * glance and becomes a thing to interpret. The traffic light belongs on the notification
 * that fires at 20%, where it is about what to do rather than about what is.
 */

/**
 * The ring's coordinate space, and its stroke inside it.
 *
 * A fraction of the box rather than a length, because the ring is drawn at anything from
 * `RING_MIN` to `RING_MAX` and the stroke has to stay the same share of it at either end:
 * a fixed stroke turns a small ring into a solid disc.
 *
 * 10 rather than the 13 this started at, which is what the reference's 8-of-62 comes to.
 * That proportion is right on a 62pt ring and reads heavy at the 96 this card draws at the
 * design footprint: the same share of a ring half again as large is half again as much ink,
 * and the arc stops looking like a line and starts looking like a band. 10% keeps the gauge
 * legible down at `RING_MIN`, where it is 4px of stroke, without dominating at the top.
 */
export const RING_BOX = 100
export const RING_STROKE = 10

/** Centred inside the stroke, so the ink stays within the box rather than half outside it. */
export const RING_RADIUS = (RING_BOX - RING_STROKE) / 2
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * The shortest arc there is, for a level that is not zero.
 *
 * One unit of the box, which with a round cap paints exactly one dot of the stroke's
 * diameter: the smallest mark the ring can make, and the reading a 1% battery deserves.
 *
 * Deliberately not the stroke width, which is the obvious answer and is wrong by twice
 * over: a round cap adds half a stroke beyond each end of the dash, so a dash of one stroke
 * is drawn two long and a 1% battery would show an arc the length of a 7% one. The cap is
 * already the thing that guarantees a visible mark, so the floor only has to be positive.
 */
const MIN_ARC = 1

/**
 * How long to draw the arc for a level, in the ring's own units.
 *
 * Zero for an empty battery and for one that cannot be read: in both cases the ring is its
 * track and nothing else, which are two different statements that happen to look alike:
 * the percentage under it says `0%` in the first case and a dash in the second, and in
 * `compact`, where there is no percentage, the dimmed icon is what tells them apart.
 */
export const arcFor = (level: number | null): number => {
  if (level === null || level <= 0) return 0
  const arc = (Math.min(100, level) / 100) * RING_CIRCUMFERENCE
  return Math.max(MIN_ARC, arc)
}
