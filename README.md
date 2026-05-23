# @gsashish/pulse-events

Production-grade typed EventEmitter for browser and Node.js.

- Full TypeScript event map inference - no manual types needed
- Wildcard event matching (`user:*`, `*.error`, `**`)
- Async-first - all handlers run in parallel; all are awaited before `emit`/`emitAll` settles, then the first handler error (if any) is re-thrown
- `next()` — promise that resolves on the next emit
- AbortSignal lifecycle — auto-cleanup listeners
- Event replay and history
- Listener inspection utilities
- Zero runtime dependencies

## Install

```bash
# GitHub Packages
npm install @gsashish/pulse-events --registry https://npm.pkg.github.com
```

## Usage

```ts
import { createEmitter } from '@gsashish/pulse-events'

type AppEvents = {
  'user:login': { userId: string; timestamp: number }
  'user:logout': { userId: string }
  'data:loaded': { count: number }
  error: Error
}

const emitter = createEmitter<AppEvents>()

// Subscribe
const off = emitter.on('user:login', async ({ userId }) => {
  await saveToDb(userId)
})

// Fire exactly once
emitter.once('data:loaded', ({ count }) => {
  console.log(count)
})

// Unsubscribe
off()

// Emit — runs exact listeners in parallel
await emitter.emit('user:login', { userId: 'u1', timestamp: Date.now() })

// Wildcard listener — receives (payload, eventName)
emitter.on('user:*', (payload, eventName) => {
  console.log(eventName, payload)
})

// Emit — runs exact + wildcard listeners in parallel
await emitter.emitAll('user:login', { userId: 'u1', timestamp: Date.now() })

// Promise that resolves on the next emit
const payload = await emitter.next('data:loaded')

// AbortSignal — auto-remove on abort
const controller = new AbortController()
emitter.on('user:login', handler, { signal: controller.signal })
controller.abort()

// History
emitter.history()               // all events
emitter.history('user:login')  // filtered by event

// Replay
await emitter.replay('user:login')
await emitter.replay('user:login', { limit: 10 })
await emitter.replaySince(Date.now() - 60_000)

// Inspect
emitter.inspect()
// { events: [{ name: 'user:login', listeners: 2 }] }

// Utilities
emitter.listenerCount('user:login')
emitter.eventNames()
emitter.clear('user:login')
emitter.clear()
```

## Wildcard patterns

| Pattern   | Matches                          |
|-----------|----------------------------------|
| `user:*`  | `user:login`, `user:logout`      |
| `*.error` | `db.error`, `net.error`          |
| `*`       | any single token                 |
| `a:*:b`   | `a:x:b`, `a:123:b`               |
| `user:**` | `user:login`, `user:login:extra` |

## API

### `createEmitter<T>(options?)`

| Option         | Type     | Description                          |
|----------------|----------|--------------------------------------|
| `historyLimit` | `number` | Max history entries to keep (optional) |

### Methods

| Method                                | Description                                      |
|---------------------------------------|--------------------------------------------------|
| `on(event, handler, options?)`        | Subscribe. Returns unsubscribe `() => void`      |
| `once(event, handler, options?)`      | Subscribe for one emission                        |
| `off(event, handler?)`               | Remove one or all handlers for event              |
| `emit(event, payload)`               | Fire exact listeners in parallel                  |
| `emitAll(event, payload)`            | Fire exact + wildcard listeners in parallel       |
| `next(event)`                         | Promise resolving on next emit                    |
| `clear(event?)`                       | Remove listeners for event or all events          |
| `listenerCount(event)`               | Active listener count for event                   |
| `eventNames()`                        | All events with active listeners                  |
| `inspect()`                           | `{ events: { name, listeners }[] }`              |
| `history(event?)`                     | Emitted event log, optionally filtered            |
| `replay(event, options?)`             | Re-emit stored events through handlers            |
| `replaySince(timestamp)`             | Re-emit all events since Unix timestamp           |

## License

MIT
