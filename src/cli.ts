import { parseArgs } from 'node:util'
import { createHttpServer } from './server.js'
import { resolveConfig } from './config.js'

const HELP_TEXT = `browseros-mcp — Standalone Browser Automation MCP Server

Supports both BrowserOS and standard Chrome via CDP.

Usage: browseros-mcp [options]

Options:
  --cdp-port <port>      Chrome CDP port (default: 9222)
  --cdp-host <host>      Chrome CDP host (default: 127.0.0.1)
  --mcp-port <port>      MCP HTTP server port (default: 3000)
  --backend <mode>       Backend mode: 'browseros', 'chrome', or 'auto' (default: auto)
  --chrome-path <path>   Path to Chrome executable (for auto-launch)
  --auto-launch          Automatically start Chrome with --remote-debugging-port
  --name <name>          MCP server name (default: browseros-mcp)
  --title <title>        MCP server title (default: BrowserOS MCP)
  --version <ver>        MCP server version (default: 0.1.0)
  --window-id <id>       Default window ID for new pages (BrowserOS mode only)
  --tab-group-id <id>    Default tab group ID for new pages (BrowserOS mode only)
  --debug                Enable verbose debug logging
  --help                 Show this help

Environment variables:
  BROWSEROS_MCP_CDP_PORT     Same as --cdp-port
  BROWSEROS_MCP_CDP_HOST     Same as --cdp-host
  BROWSEROS_MCP_MCP_PORT     Same as --mcp-port
  BROWSEROS_MCP_BACKEND      Same as --backend
  BROWSEROS_MCP_CHROME_PATH  Same as --chrome-path
  BROWSEROS_MCP_AUTO_LAUNCH  Set to '1' for --auto-launch
  BROWSEROS_MCP_SERVER_NAME  Same as --name
  BROWSEROS_MCP_DEBUG       Set to '1' for --debug

Examples:
  # Connect to standard Chrome (started separately)
  chrome --remote-debugging-port=9222 &
  browseros-mcp --backend chrome

  # Connect to BrowserOS
  browseros-mcp --backend browseros --cdp-port 9100

  # Auto-detect backend and auto-launch Chrome
  browseros-mcp --auto-launch --backend auto

  # Use a specific Chrome path
  browseros-mcp --auto-launch --chrome-path /usr/bin/chromium

  # Enable debug logging
  browseros-mcp --debug
`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'cdp-port': { type: 'string' },
      'cdp-host': { type: 'string' },
      'mcp-port': { type: 'string' },
      'backend': { type: 'string' },
      'chrome-path': { type: 'string' },
      'auto-launch': { type: 'boolean', default: false },
      'name': { type: 'string' },
      'title': { type: 'string' },
      'version': { type: 'string' },
      'window-id': { type: 'string' },
      'tab-group-id': { type: 'string' },
      'debug': { type: 'boolean', default: false },
      'help': { type: 'boolean', default: false },
    },
    strict: false,
  })

  if (values.help) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  const config = resolveConfig(values)
  await createHttpServer(config)
}

main().catch((err) => {
  console.error(`[browseros-mcp] Fatal error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
