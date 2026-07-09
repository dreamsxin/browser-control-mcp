import type { BrowserSession } from '../browser/session'
import {
  BROWSER_STATE_RESOURCE_URI,
  type BrowserStateEvents,
} from '../browser/state-events'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  BROWSER_AUTOMATION_PROMPT_DESCRIPTION,
  BROWSER_AUTOMATION_PROMPT_NAME,
  BROWSER_AUTOMATION_PROMPT_TITLE,
  BROWSER_MCP_INSTRUCTIONS,
  buildBrowserAutomationPrompt,
} from './mcp-prompt'
import {
  type BrowserToolDefaults,
  type BrowserToolRegistrationOptions,
  registerBrowserTools,
} from './register'

export interface BrowserMcpServerOptions extends BrowserToolDefaults {
  name: string
  title: string
  version: string
  browserSession: BrowserSession
  browserState?: BrowserStateEvents
  instructions?: string
  registration?: BrowserToolRegistrationOptions
}

/** Creates an MCP server with the shared browser tool surface. */
export function createBrowserMcpServer(
  options: BrowserMcpServerOptions,
): McpServer {
  const server = new McpServer(
    {
      name: options.name,
      title: options.title,
      version: options.version,
    },
    {
      capabilities: { logging: {}, resources: { subscribe: true, listChanged: true } },
      instructions: options.instructions ?? BROWSER_MCP_INSTRUCTIONS,
    },
  )

  server.server.setRequestHandler(SetLevelRequestSchema, () => {
    return {}
  })

  server.registerPrompt(
    BROWSER_AUTOMATION_PROMPT_NAME,
    {
      title: BROWSER_AUTOMATION_PROMPT_TITLE,
      description: BROWSER_AUTOMATION_PROMPT_DESCRIPTION,
      argsSchema: {
        task: z
          .string()
          .optional()
          .describe('Optional browser task to include in the prompt.'),
      },
    },
    ({ task }) => ({
      description: BROWSER_AUTOMATION_PROMPT_DESCRIPTION,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildBrowserAutomationPrompt(task),
          },
        },
      ],
    }),
  )

  if (options.browserState) {
    server.registerResource(
      'browser-state',
      BROWSER_STATE_RESOURCE_URI,
      {
        title: 'Browser state',
        description: 'Unified browser window, tab, tab group, active page, and state sequence snapshot.',
        mimeType: 'application/json',
      },
      async () => {
        const snapshot = await options.browserState!.snapshot(options.browserSession)
        return {
          contents: [
            {
              uri: BROWSER_STATE_RESOURCE_URI,
              mimeType: 'application/json',
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        }
      },
    )
  }

  registerBrowserTools(
    server,
    options.browserSession,
    {
      defaultWindowId: options.defaultWindowId,
      defaultTabGroupId: options.defaultTabGroupId,
    },
    options.browserState
      ? {
          ...options.registration,
          browserState: options.browserState,
        }
      : options.registration,
    options.browserSession.backend,
  )

  return server
}
