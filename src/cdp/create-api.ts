import type { DomainApi, ProtocolApi, Unsubscribe } from './types.js'

/**
 * Raw send function: (method, params?) → Promise<result>
 * The method is the full CDP method name, e.g. "Page.navigate".
 */
export type RawSend = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>

/**
 * Raw event subscription: (event, handler) → Unsubscribe
 * The event is the full CDP event name, e.g. "Page.frameNavigated".
 */
export type RawOn = (
  event: string,
  handler: (params: unknown) => void,
) => Unsubscribe

/**
 * Create a dynamic Proxy for a CDP domain.
 *
 * Every property access on the domain object becomes either:
 *   - `.on("event", handler)` → subscribes to CDP events
 *   - `.methodName(params)`  → sends a CDP command
 *
 * No code generation needed at runtime — the Proxy handles all routing.
 * Generated type definitions provide compile-time safety.
 *
 * @example
 *   const page = createDomainProxy("Page", send, on)
 *   await page.navigate({ url: "https://example.com" })
 *   // → send("Page.navigate", { url: "..." })
 */
export function createDomainProxy(
  domain: string,
  send: RawSend,
  on: RawOn,
): DomainApi & Record<string, (params?: Record<string, unknown>) => Promise<unknown>> {
  return new Proxy(Object.create(null), {
    get(_target, method: string) {
      if (method === 'on') {
        return (event: string, handler: (params: unknown) => void): Unsubscribe =>
          on(`${domain}.${event}`, handler)
      }
      // All other property accesses become command senders:
      // api.Page.navigate(params) → send("Page.navigate", params)
      return (params?: Record<string, unknown>) =>
        send(`${domain}.${method}`, params)
    },
  }) as any
}

/**
 * Build a complete ProtocolApi from a list of CDP domain names.
 *
 * @param domains - CDP domain names (e.g. ["Page", "Browser", "Runtime", ...])
 * @param send - Raw CDP command sender
 * @param on - Raw CDP event subscriber
 * @returns A type-safe dynamic API object
 *
 * @example
 *   const api = createProtocolApi(["Page", "Runtime", "Browser"], send, on)
 *   await api.Page.navigate({ url: "..." })
 *   api.Page.on("frameNavigated", (params) => console.log(params))
 */
export function createProtocolApi(
  domains: string[],
  send: RawSend,
  on: RawOn,
): ProtocolApi {
  const api: Record<string, any> = Object.create(null)
  for (const domain of domains) {
    api[domain] = createDomainProxy(domain, send, on)
  }
  return api as ProtocolApi
}

/**
 * Create a domain API object with the same shape as the top-level protocol API
 * but namespaced under a session. Used for target-attached sessions.
 *
 * When a session is attached via Target.attachToTarget, all commands
 * from that session go through the session's transport, not the main one.
 */
export function createSessionApi(
  domains: string[],
  send: RawSend,
  on: RawOn,
): ProtocolApi {
  return createProtocolApi(domains, send, on)
}
