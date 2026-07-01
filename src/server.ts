import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { StreamableHTTPTransport } from '@hono/mcp'
import { CdpConnectionImpl } from './cdp/connection-impl.js'
import { BrowserSession } from './browser/session.js'
import { createBrowserMcpServer } from './mcp/mcp-server.js'
import { launchChrome } from './chrome-launch.js'
import type { ServerConfig, BackendMode } from './config.js'

/**
 * Detect backend mode by probing the connected browser.
 * BrowserOS reports "BrowserOS/xxx" in the Browser field; standard Chrome reports "Chrome/xxx".
 */
function detectBackend(browserString: string | undefined): BackendMode {
  if (!browserString) return 'chrome'
  return browserString.toLowerCase().includes('browseros') ? 'browseros' : 'chrome'
}

/**
 * Create and start the HTTP+SSE MCP server.
 */
export async function createHttpServer(config: ServerConfig): Promise<void> {
  // 1. Optional: auto-launch Chrome
  if (config.autoLaunch) {
    await launchChrome(config.cdpPort, config.chromePath)
  }

  // 2. Connect to CDP
  const cdp = new CdpConnectionImpl({
    port: config.cdpPort,
    host: config.cdpHost,
    maxRetries: config.cdpMaxRetries,
    retryDelay: config.cdpRetryDelay,
    fetchTimeout: config.cdpFetchTimeout,
  })
  await cdp.connect()
  console.error(`[browseros-mcp] Connected to CDP on port ${config.cdpPort}`)

  // 3. Resolve backend mode
  let backend: BackendMode
  if (config.backend === 'auto') {
    backend = detectBackend(cdp.versionInfo?.Browser)
    console.error(`[browseros-mcp] Auto-detected backend: ${backend}`)
  } else {
    backend = config.backend
    console.error(`[browseros-mcp] Backend mode: ${backend}`)
  }

  // 4. Create BrowserSession with backend mode
  const session = new BrowserSession(cdp, { backend })

  // 5. Create MCP Server
  const mcpServer = createBrowserMcpServer({
    name: config.serverName,
    title: config.serverTitle,
    version: config.serverVersion,
    browserSession: session,
    ...(config.defaultWindowId !== undefined && { defaultWindowId: config.defaultWindowId }),
    ...(config.defaultTabGroupId !== undefined && { defaultTabGroupId: config.defaultTabGroupId }),
  })

  // 6. HTTP+SSE server (Hono + StreamableHTTPTransport)
  const app = new Hono()

  app.all('/mcp', async (c) => {
    const transport = new StreamableHTTPTransport()
    await mcpServer.connect(transport)
    return transport.handleRequest(c.req.raw)
  })

  // Health check endpoint
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      cdp: cdp.isConnected(),
      backend,
      browser: cdp.versionInfo?.Browser ?? 'unknown',
    }),
  )

  // 7. Start listening
  serve({ fetch: app.fetch, port: config.mcpPort }, (info) => {
    console.error(`[browseros-mcp] MCP server listening on http://localhost:${info.port}/mcp`)
    console.error(`[browseros-mcp] Health check at http://localhost:${info.port}/health`)
  })

  // 8. Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('[browseros-mcp] Shutting down...')
    await cdp.disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.error('[browseros-mcp] Received SIGTERM, shutting down...')
    await cdp.disconnect()
    process.exit(0)
  })
}
