/**
 * Base type for all events
 * Keys represent event names.
 * Values represent payload types for those events.
 * 
 * @example
 *  type AppEvents = {
 *   'user:login': { userId: string }
 *   'error': Error
 *  }
 */
type EventMap = Record<string, unknown>;

/**
 * A standard event listener function.
 *
 * Receives the payload associated with an event.
 * Supports both synchronous and asynchronous handlers.
 *
 * @template TPayload
 * Type of the event payload.
 */
type Handler<TPayload = unknown> = (
    payload: TPayload
) => void | Promise<void>

/**
 * A wildcard event listener function.
 *
 * Receives the payload associated with an event.
 * Supports both synchronous and asynchronous handlers.
 *
 * @template TPayload
 * Type of the event payload.
 */
type WildcardHandler<TPayload = unknown> = (payload: TPayload, event: string) => void | Promise<void>;


/**
 * Configuration options for event listeners.
 *
 * Passed as the third argument to `on()` and `once()`.
 *
 * Currently supports automatic listener cleanup
 * through the AbortController API.
 *
 * Designed to be extensible for future listener options.
 */
interface ListenerOptions {
    /**
     * Automatically removes the listener
     * when the signal is aborted.
     */
    signal?: AbortSignal
}

/**
 * Configuration options for event replay operations.
 *
 * Passed to `replay()` to control
 * how stored history entries are replayed.
 */
interface ReplayOptions {
    /**
     * Replays only the latest N history entries.
     *
     * Example:
     * limit: 10
     * -> replays the 10 most recent events
     */
    limit?: number
}



/**
 * Represents a single stored event entry
 * inside the internal history system.
 *
 * Created whenever an event is emitted.
 *
 * @template TPayload
 * Type of the emitted payload.
 */
type HistoryEntry<TPayload = unknown> = {
    event: string,
    payload: TPayload,
    /**
   * Unix timestamp (Date.now())
   * recorded at emit time.
   */
    timestamp: number
}
/**
 * Result returned from `emitter.inspect()`.
 *
 * Provides lightweight debugging and
 * listener inspection metadata.
 */
interface InspectResult {
    events: {
        /**
         * Event name or wildcard pattern.
         */
        name: string

        /**
         * Number of active listeners
         * registered for this event.
         */
        listeners: number
    }[]
}


/**
 * Internal listener record stored
 * inside the emitter registry.
 *
 * Used for internal bookkeeping and
 * listener lifecycle management.
 *
 * Not exposed publicly to consumers.
 *
 * @template TPayload
 * Type of the listener payload.
 */
type HandlerEntry<TPayload = unknown> = {
    /**
     * Listener function.
     *
     * Can be either:
     * - a standard event handler
     * - a wildcard handler
     */
    handler:
    | Handler<TPayload>
    | WildcardHandler<TPayload>

    /**
     * Indicates whether the listener
     * should automatically remove itself
     * after the first invocation.
     */
    once: boolean

    /**
     * Indicates whether the registered
     * event key is a wildcard pattern.
     */
    isWildcard: boolean
}


/**
 * Main event runtime interface.
 *
 * Returned from `createEmitter<T>()`.
 *
 * Provides strongly typed event APIs,
 * wildcard support, async dispatching,
 * replay/history utilities, and
 * listener lifecycle management.
 *
 * @template T
 * User-defined event map.
 */
interface Emitter<T extends EventMap> {
    on<K extends keyof T & string>(
        event: K,
        handler: Handler<T[K]>,
        options?: ListenerOptions
    ): () => void

    on(
        event: string,
        handler: WildcardHandler,
        options?: ListenerOptions
    ): () => void

    once<K extends keyof T & string>(
        event: K,
        handler: Handler<T[K]>,
        options?: ListenerOptions
    ): () => void

    off<K extends keyof T & string>(
        event: K,
        handler?: Handler<T[K]>
    ): void

    emit<K extends keyof T & string>(
        event: K,
        payload: T[K]
    ): Promise<void>

    emitAll<K extends keyof T & string>(
        event: K,
        payload: T[K]
    ): Promise<void>

    next<K extends keyof T & string>(
        event: K
    ): Promise<T[K]>

    clear(event?: string): void

    listenerCount(event: string): number

    eventNames(): string[]

    inspect(): InspectResult

    history(): HistoryEntry[]
    history<K extends keyof T & string>(event: K): HistoryEntry<T[K]>[]

    replay<K extends keyof T & string>(
        event: K,
        options?: ReplayOptions
    ): Promise<void>

    replaySince(timestamp: number): Promise<void>
}



export type { EventMap, Handler, WildcardHandler, ListenerOptions, ReplayOptions, HistoryEntry, InspectResult, HandlerEntry, Emitter };
