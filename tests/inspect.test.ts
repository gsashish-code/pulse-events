/// <reference types="vitest/globals" />
import { createEmitter } from '../src/index'

type AppEvents = {
  'user:login': { userId: string; timestamp: number }
  'user:logout': { userId: string }
  'data:loaded': { count: number }
  error: Error
}

function makeEmitter() {
  return createEmitter<AppEvents>()
}

describe('inspect()', () => {
  it('returns correct event names and listener counts', () => {
    const emitter = makeEmitter()
    emitter.on('data:loaded', () => {})
    emitter.on('data:loaded', () => {})
    emitter.on('user:login', () => {})
    const result = emitter.inspect()
    const dataEntry = result.events.find(e => e.name === 'data:loaded')
    const loginEntry = result.events.find(e => e.name === 'user:login')
    expect(dataEntry?.listeners).toBe(2)
    expect(loginEntry?.listeners).toBe(1)
  })

  it('returns empty array when no listeners', () => {
    const emitter = makeEmitter()
    expect(emitter.inspect().events).toHaveLength(0)
  })

  it('does not include cleared events', () => {
    const emitter = makeEmitter()
    emitter.on('data:loaded', () => {})
    emitter.clear('data:loaded')
    const result = emitter.inspect()
    expect(result.events.find(e => e.name === 'data:loaded')).toBeUndefined()
  })

  it('includes wildcard patterns with correct counts', () => {
    const emitter = makeEmitter()
    emitter.on('user:*', () => {})
    emitter.on('user:*', () => {})
    const result = emitter.inspect()
    const entry = result.events.find(e => e.name === 'user:*')
    expect(entry?.listeners).toBe(2)
  })

  it('updates after listener removal', () => {
    const emitter = makeEmitter()
    const handler = () => {}
    emitter.on('data:loaded', handler)
    emitter.on('data:loaded', () => {})
    emitter.off('data:loaded', handler)
    const result = emitter.inspect()
    const entry = result.events.find(e => e.name === 'data:loaded')
    expect(entry?.listeners).toBe(1)
  })

  it('updates after abort removes listener', () => {
    const emitter = makeEmitter()
    const controller = new AbortController()
    emitter.on('data:loaded', () => {}, { signal: controller.signal })
    emitter.on('data:loaded', () => {})
    controller.abort()
    const result = emitter.inspect()
    const entry = result.events.find(e => e.name === 'data:loaded')
    expect(entry?.listeners).toBe(1)
  })
})
