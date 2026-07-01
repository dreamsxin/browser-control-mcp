/**
 * Server configuration — supports both BrowserOS and standard Chrome backends.
 *
 * The `backend` option determines which CDP domains are used:
 *   - 'browseros': Uses BrowserOS custom CDP domains (Browser.getTabs, Browser.getWindows, etc.)
 *   - 'chrome':    Uses standard Chrome CDP domains (Target.getTargets, Target.createTarget, etc.)
 *   - 'auto':      Probes the connected browser to detect BrowserOS vs standard Chrome
 */

export type BackendMode = 'browseros' | 'chrome' | 'auto'

export interface ServerConfig {
  /** Chrome/BrowserOS CDP remote debugging port (default: 9222) */
  cdpPort: number
  /** CDP host address (default: 127.0.0.1) */
  cdpHost: string
  /** MCP HTTP server port (default: 3000) */
  mcpPort: number
  /** Browser backend mode (default: 'auto') */
  backend: BackendMode
  /** Chrome executable path (optional, for auto-launch) */
  chromePath?: string
  /** Whether to auto-launch Chrome (default: false) */
  autoLaunch: boolean
  /** MCP server name (default: "browseros-mcp") */
  serverName: string
  /** MCP server title (default: "BrowserOS MCP") */
  serverTitle: string
  /** MCP server version (default: "0.1.0") */
  serverVersion: string
  /** Default window ID for new pages (BrowserOS mode only) */
  defaultWindowId?: number
  /** Default tab group ID for new pages (BrowserOS mode only) */
  defaultTabGroupId?: string
  /** Max retries for CDP connection (default: 10) */
  cdpMaxRetries: number
  /** Retry delay in ms (default: 1000) */
  cdpRetryDelay: number
  /** HTTP fetch timeout in ms (default: 5000) */
  cdpFetchTimeout: number
}

export const DEFAULT_CONFIG: ServerConfig = {
  cdpPort: 9222,
  cdpHost: '127.0.0.1',
  mcpPort: 3000,
  backend: 'auto',
  autoLaunch: false,
  serverName: 'browseros-mcp',
  serverTitle: 'BrowserOS MCP',
  serverVersion: '0.1.0',
  cdpMaxRetries: 10,
  cdpRetryDelay: 1000,
  cdpFetchTimeout: 5000,
}

/**
 * Parse CLI arguments into a partial ServerConfig.
 */
export function configFromArgs(args: Record<string, unknown>): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {}

  if (args['cdp-port']) config.cdpPort = Number(args['cdp-port'])
  if (args['cdp-host']) config.cdpHost = String(args['cdp-host'])
  if (args['mcp-port']) config.mcpPort = Number(args['mcp-port'])
  if (args['backend']) config.backend = String(args['backend']) as BackendMode
  if (args['chrome-path']) config.chromePath = String(args['chrome-path'])
  if (args['auto-launch']) config.autoLaunch = true
  if (args['name']) config.serverName = String(args['name'])
  if (args['title']) config.serverTitle = String(args['title'])
  if (args['version']) config.serverVersion = String(args['version'])
  if (args['window-id']) config.defaultWindowId = Number(args['window-id'])
  if (args['tab-group-id']) config.defaultTabGroupId = String(args['tab-group-id'])

  return config
}

/**
 * Parse environment variables (BROWSEROS_MCP_* prefix) into a partial ServerConfig.
 */
export function configFromEnv(): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {}
  const env = process.env

  if (env.BROWSEROS_MCP_CDP_PORT) config.cdpPort = Number(env.BROWSEROS_MCP_CDP_PORT)
  if (env.BROWSEROS_MCP_CDP_HOST) config.cdpHost = env.BROWSEROS_MCP_CDP_HOST
  if (env.BROWSEROS_MCP_MCP_PORT) config.mcpPort = Number(env.BROWSEROS_MCP_MCP_PORT)
  if (env.BROWSEROS_MCP_BACKEND) config.backend = env.BROWSEROS_MCP_BACKEND as BackendMode
  if (env.BROWSEROS_MCP_CHROME_PATH) config.chromePath = env.BROWSEROS_MCP_CHROME_PATH
  if (env.BROWSEROS_MCP_AUTO_LAUNCH === '1') config.autoLaunch = true
  if (env.BROWSEROS_MCP_SERVER_NAME) config.serverName = env.BROWSEROS_MCP_SERVER_NAME
  if (env.BROWSEROS_MCP_SERVER_VERSION) config.serverVersion = env.BROWSEROS_MCP_SERVER_VERSION

  return config
}

/**
 * Merge configs with priority: CLI args > env vars > defaults.
 */
export function resolveConfig(
  args: Record<string, unknown> = {},
): ServerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...configFromEnv(),
    ...configFromArgs(args),
  }
}
