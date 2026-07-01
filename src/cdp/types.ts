// ── Core types for cdp-kit ──

/** CDP version info returned by /json/version endpoint */
export interface CdpVersionInfo {
  Browser: string
  'Protocol-Version': string
  'User-Agent': string
  'V8-Version': string
  'WebKit-Version': string
  webSocketDebuggerUrl: string
}

/** A debuggable target (tab, service worker, etc.) */
export interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl: string
  /** Optional browser-specific metadata */
  tabId?: number
  windowId?: number
}

/** Transport abstraction: send a CDP command and get a raw response */
export interface CdpTransport {
  /** Send a raw CDP message (JSON string) */
  send(message: string): Promise<void>
  /** Register message handler */
  onMessage(handler: (data: string) => void): () => void
  /** Close the transport */
  close(): Promise<void>
  /** Whether the transport is connected */
  readonly connected: boolean
}

/** Raw CDP message sent over wire */
export interface CdpRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}

/** Raw CDP response received from wire */
export interface CdpResponse {
  id: number
  result?: unknown
  error?: CdpError
}

/** Raw CDP event received from wire */
export interface CdpEvent {
  method: string
  params?: unknown
}

/** CDP error object */
export interface CdpError {
  code: number
  message: string
  data?: unknown
}

/** A pending request waiting for response */
export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  method: string
}

/** Configuration for CdpClient */
export interface CdpClientConfig {
  /** Host address (default: 127.0.0.1) */
  host?: string
  /** CDP port (default: 9222) */
  port?: number
  /** Custom transport factory (overrides host/port) */
  transport?: () => CdpTransport | Promise<CdpTransport>
  /** Max retries for initial connection */
  maxRetries?: number
  /** Retry delay in ms */
  retryDelay?: number
  /** Single HTTP request timeout in ms */
  fetchTimeout?: number
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean
}

/** Event subscription token (call to unsubscribe) */
export type Unsubscribe = () => void

/** Event handler function */
export type EventHandler<T = unknown> = (params: T) => void

// ── ProtocolApi placeholder types (will be replaced by generated types) ──

/** Base signature for all CDP domain APIs */
export interface DomainApi {
  on(event: string, handler: EventHandler): Unsubscribe
}

/**
 * Protocol API — a flat namespace of CDP domains.
 * Each domain has methods matching its CDP commands and an `on()` for events.
 *
 * Example: `api.Page.navigate({ url: "https://example.com" })`
 */
export type ProtocolApi = Record<string, Record<string, (...args: any[]) => any>>
