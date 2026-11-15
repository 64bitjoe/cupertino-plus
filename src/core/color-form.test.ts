import { describe, expect, it } from 'vitest'
import { COLOR_CUSTOM, foldColor, splitColor } from './color-form'

describe('splitColor', () => {
  it('leaves a palette colour in the dropdown and closes the custom box', () => {
    const data: Record<string, unknown> = { color: 'red' }
    expect(splitColor(data, true)).toBe(false)
    expect(data).toEqual({ color: 'red' })
  })

  it('moves a literal into the custom box', () => {
    const data: Record<string, unknown> = { color: '#ff0000' }
    expect(splitColor(data, false)).toBe(false)
    expect(data).toEqual({ color: COLOR_CUSTOM, color_custom: '#ff0000' })
  })

  it('keeps an empty custom box open while it is remembered', () => {
    const data: Record<string, unknown> = {}
    expect(splitColor(data, true)).toBe(true)
    expect(data).toEqual({ color: COLOR_CUSTOM, color_custom: '' })
  })

  it('leaves no colour alone when the box is not open', () => {
    const data: Record<string, unknown> = { color: undefined }
    expect(splitColor(data, false)).toBe(false)
    expect(data).toEqual({ color: undefined })
  })
})

describe('foldColor', () => {
  it('folds the custom box back into color', () => {
    const data: Record<string, unknown> = { color: COLOR_CUSTOM, color_custom: '#0f0' }
    expect(foldColor(data)).toBe(true)
    expect(data).toEqual({ color: '#0f0' })
  })

  it('drops the custom box when a palette colour is picked', () => {
    const data: Record<string, unknown> = { color: 'blue', color_custom: '#0f0' }
    expect(foldColor(data)).toBe(false)
    expect(data).toEqual({ color: 'blue' })
  })
})
