/**
 * Reading a config value against a closed list of the values it may take.
 *
 * Every card validates its enums the same way — exact strings only, so `Glass` falls back rather
 * than being guessed at, and a hand-written near miss reads as the default — and this is that
 * once, instead of a `(LIST as readonly unknown[]).includes(value) ? … : fallback` in every model.
 */

/** Whether `value` is one of `list`'s, as a type guard. */
export const isOneOf = <T>(list: readonly T[], value: unknown): value is T =>
  (list as readonly unknown[]).includes(value)

/** `value` if it is one of `list`'s, else `fallback` (or `undefined` with none). */
export function oneOf<T>(list: readonly T[], value: unknown, fallback: T): T
export function oneOf<T>(list: readonly T[], value: unknown): T | undefined
export function oneOf<T>(list: readonly T[], value: unknown, fallback?: T): T | undefined {
  return isOneOf(list, value) ? value : fallback
}
