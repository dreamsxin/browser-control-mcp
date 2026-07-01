import type { CdpTransport } from './types.js'
import WebSocket from 'ws'

/**
 * WebSocket-based CDP transport.
 *
 * Wraps a `ws` WebSocket connection and implements the CdpTransport interface
 * for raw message send/receive.
 */
export class WebSocketTransport implements CdpTransport {
  private ws: WebSocket | null = null
  private _connected = false
  private messageHandlers = new Set<(data: string) => void>()
  private closeHandlers = new Set<() => void>()
  private errorHandlers = new Set<(error: Error) => void>()

  /** Whether the transport is currently connected */
  get connected(): boolean {
    return this._connected
  }

  /**
   * Connect to a CDP WebSocket endpoint.
   * @param url - WebSocket URL (e.g. "ws://127.0.0.1:9222/devtools/browser/...")
   */
  async connect(url: string): Promise<void> {
    if (this._connected) {
      await this.close()
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 })

      ws.on('open', () => {
        this.ws = ws
        this._connected = true
        resolve()
      })

      ws.on('message', (data: WebSocket.Data) => {
        const text = data.toString()
        for (const handler of this.messageHandlers) {
          try { handler(text) } catch { /* swallow handler errors */ }
        }
      })

      ws.on('close', (code, reason) => {
        this._connected = false
        // If the connection was never established, it's a connection failure
        if (!this.ws) {
          reject(new Error(`WebSocket connection failed: ${code} ${reason}`))
        }
        for (const handler of this.closeHandlers) {
          try { handler() } catch { /* swallow */ }
        }
      })

      ws.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err))
        // If still connecting, reject the connect promise
        if (!this._connected) {
          reject(error)
        }
        for (const handler of this.errorHandlers) {
          try { handler(error) } catch { /* swallow */ }
        }
      })
    })
  }

  /**
   * Send a raw CDP message (JSON string).
   * Messages are queued internally by the ws library.
   */
  async send(message: string): Promise<void> {
    if (!this.ws || !this._connected) {
      throw new Error('Transport not connected')
    }
    this.ws.send(message)
  }

  /**
   * Register a handler for incoming messages.
   * @returns Unsubscribe function
   */
  onMessage(handler: (data: string) => void): () => void {
    this.messageHandlers.add(handler)
    return () => { this.messageHandlers.delete(handler) }
  }

  /**
   * Register a handler for transport close events.
   */
  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler)
    return () => { this.closeHandlers.delete(handler) }
  }

  /**
   * Register a handler for transport errors.
   */
  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler)
    return () => { this.errorHandlers.delete(handler) }
  }

  /**
   * Close the transport connection.
   */
  async close(): Promise<void> {
    if (this.ws) {
      this._connected = false
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.messageHandlers.clear()
    this.closeHandlers.clear()
    this.errorHandlers.clear()
  }
}
