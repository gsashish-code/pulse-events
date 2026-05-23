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

describe('historyLimit', () => {
  it('historyLimit: 0 stores no history', async () => {
    const emitter = createEmitter<AppEvents>({ historyLimit: 0 })
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    expect(emitter.history()).toHaveLength(0)
  })

  it('historyLimit: N keeps only the latest N entries', async () => {
    const emitter = createEmitter<AppEvents>({ historyLimit: 2 })
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    await emitter.emit('data:loaded', { count: 3 })
    expect(emitter.history()).toHaveLength(2)
    expect(
      emitter.history('data:loaded').map(e => (e.payload as { count: number }).count)
    ).toEqual([2, 3])
  })
})

describe('history()', () => {
  it('stores emitted payloads', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 5 })
    const h = emitter.history()
    expect(h).toHaveLength(1)
    expect(h[0]!.payload).toEqual({ count: 5 })
  })

  it('history(event) filters correctly', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('user:logout', { userId: 'u1' })
    await emitter.emit('data:loaded', { count: 2 })
    const h = emitter.history('data:loaded')
    expect(h).toHaveLength(2)
    expect(h.every(e => e.event === 'data:loaded')).toBe(true)
  })

  it('preserves emit ordering', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    await emitter.emit('data:loaded', { count: 3 })
    const h = emitter.history('data:loaded')
    expect(h.map(e => (e.payload as { count: number }).count)).toEqual([1, 2, 3])
  })

  it('timestamps are valid numbers', async () => {
    const emitter = makeEmitter()
    const before = Date.now()
    await emitter.emit('data:loaded', { count: 0 })
    const after = Date.now()
    const h = emitter.history()
    expect(h[0]!.timestamp).toBeGreaterThanOrEqual(before)
    expect(h[0]!.timestamp).toBeLessThanOrEqual(after)
  })

  it('history() returns all events across all names', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('user:logout', { userId: 'u1' })
    const h = emitter.history()
    expect(h).toHaveLength(2)
  })

  it('returns a copy — mutations do not affect internal state', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    const h = emitter.history()
    h.splice(0)
    expect(emitter.history()).toHaveLength(1)
  })
})

describe('replay()', () => {
  it('re-emits stored events through handlers', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 7 })
    const received: number[] = []
    emitter.on('data:loaded', p => { received.push(p.count) })
    await emitter.replay('data:loaded')
    expect(received).toContain(7)
  })

  it('replay({ limit }) replays latest N events', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    await emitter.emit('data:loaded', { count: 3 })
    const received: number[] = []
    emitter.on('data:loaded', p => { received.push(p.count) })
    await emitter.replay('data:loaded', { limit: 2 })
    expect(received).toEqual([2, 3])
  })

  it('fresh emissions from handlers during replay are recorded in history', async () => {
    const emitter = createEmitter<AppEvents>()
    await emitter.emit('data:loaded', { count: 1 })
    emitter.on('data:loaded', async () => {
      await emitter.emit('user:logout', { userId: 'side-effect' })
    })
    await emitter.replay('data:loaded')
    expect(emitter.history('user:logout')).toHaveLength(1)
  })

  it('replayed events do not get stored in history again', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    emitter.on('data:loaded', () => {})
    await emitter.replay('data:loaded')
    expect(emitter.history('data:loaded')).toHaveLength(1)
  })

  it('replay errors do not stop remaining replays', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    const received: number[] = []
    let first = true
    emitter.on('data:loaded', p => {
      if (first) { first = false; throw new Error('boom') }
      received.push(p.count)
    })
    await emitter.replay('data:loaded')
    expect(received).toContain(2)
  })

  it('replayed events trigger wildcard listeners', async () => {
    const emitter = makeEmitter()
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    const received: string[] = []
    emitter.on('user:*', (_p, name) => { received.push(name) })
    await emitter.replay('user:login')
    expect(received).toContain('user:login')
  })
})

describe('replaySince()', () => {
  it('filters by timestamp', async () => {
    const emitter = makeEmitter()
    await emitter.emit('data:loaded', { count: 1 })
    await new Promise(r => setTimeout(r, 5))
    const cutoff = Date.now()
    await emitter.emit('data:loaded', { count: 2 })
    const received: number[] = []
    emitter.on('data:loaded', p => { received.push(p.count) })
    await emitter.replaySince(cutoff)
    expect(received).toContain(2)
    expect(received).not.toContain(1)
  })

  it('replays events across all event names since timestamp', async () => {
    const emitter = makeEmitter()
    const cutoff = Date.now()
    await emitter.emit('data:loaded', { count: 5 })
    await emitter.emit('user:logout', { userId: 'u1' })
    const received: string[] = []
    emitter.on('data:loaded', () => { received.push('data:loaded') })
    emitter.on('user:logout', () => { received.push('user:logout') })
    await emitter.replaySince(cutoff)
    expect(received).toContain('data:loaded')
    expect(received).toContain('user:logout')
  })

  it('replaySince does not double-record history', async () => {
    const emitter = makeEmitter()
    const cutoff = Date.now()
    await emitter.emit('data:loaded', { count: 1 })
    emitter.on('data:loaded', () => {})
    await emitter.replaySince(cutoff)
    expect(emitter.history('data:loaded')).toHaveLength(1)
  })
})
