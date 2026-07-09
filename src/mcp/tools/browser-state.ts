import { z } from 'zod'
import { BROWSER_STATE_RESOURCE_URI } from '../../browser/state-events'
import { defineTool, errorResult, textResult, clampTimeout } from './framework'
import { browserStateEventSchema, browserStateSnapshotSchema } from './output-schemas'

const ACTIONS = ['get', 'wait'] as const

export const browser_state = defineTool({
  name: 'browser_state',
  description:
    'Read or wait for the unified browser space model. Use action="get" to inspect windows, tabs, tab groups, active tab, and the current state sequence. Use action="wait" to block until the browser state changes after a known sequence.',
  input: z.object({
    action: z.enum(ACTIONS).default('get'),
    sinceSeq: z
      .number()
      .int()
      .optional()
      .describe('For action="wait", return only after the browser state sequence is greater than this value. Defaults to the current sequence.'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum wait time for action="wait"; defaults to 10000ms and is capped at 60000ms.'),
  }),
  output: z.object({
    action: z.enum(ACTIONS),
    resourceUri: z.string(),
    snapshot: browserStateSnapshotSchema.optional(),
    event: browserStateEventSchema.optional(),
  }),
  annotations: { readOnlyHint: true },
  handler: async (args, ctx) => {
    const state = ctx.browserState
    if (!state) return errorResult('browser_state: browser state tracking is not available.')

    if (args.action === 'wait') {
      const timeoutMs = clampTimeout(args.timeoutMs, 10_000, 60_000)
      const event = await state.waitForChange(args.sinceSeq, timeoutMs, ctx.signal)
      return textResult(formatEvent(event), {
        action: 'wait',
        resourceUri: BROWSER_STATE_RESOURCE_URI,
        event,
      })
    }

    const snapshot = await state.snapshot(ctx.session)
    return textResult(formatSnapshot(snapshot), {
      action: 'get',
      resourceUri: BROWSER_STATE_RESOURCE_URI,
      snapshot,
    })
  },
})

function formatSnapshot(snapshot: {
  seq: number
  capturedAt: string
  backend: string
  summary: {
    tabCount: number
    windowCount?: number
    tabGroupCount?: number
    activePage?: number
    activeTabId?: number
    activeWindowId?: number
  }
  pages: Array<{
    page: number
    tabId: number
    url: string
    title: string
    isActive: boolean
    windowId?: number
    index?: number
    groupId?: string
  }>
}): string {
  const lines = [
    `browser state seq=${snapshot.seq} backend=${snapshot.backend} tabs=${snapshot.summary.tabCount} windows=${snapshot.summary.windowCount ?? 0} groups=${snapshot.summary.tabGroupCount ?? 0}`,
  ]
  if (snapshot.summary.activePage !== undefined) {
    lines.push(`active page=${snapshot.summary.activePage} tabId=${snapshot.summary.activeTabId ?? 'unknown'} windowId=${snapshot.summary.activeWindowId ?? 'unknown'}`)
  }
  for (const page of snapshot.pages) {
    const flags = [
      page.isActive ? 'active' : '',
      page.windowId !== undefined ? `window=${page.windowId}` : '',
      page.index !== undefined ? `index=${page.index}` : '',
      page.groupId !== undefined ? `group=${page.groupId}` : '',
    ].filter(Boolean)
    lines.push(`[${page.page}] tab=${page.tabId}${flags.length ? ` ${flags.join(' ')}` : ''} ${page.url}${page.title ? ` (${page.title})` : ''}`)
  }
  return lines.join('\n')
}

function formatEvent(event: {
  seq: number
  reason: string
  changedAt: string
  summary: {
    tabCount: number
    windowCount?: number
    tabGroupCount?: number
    activePage?: number
  }
}): string {
  return `browser state changed seq=${event.seq} reason=${event.reason} at=${event.changedAt} tabs=${event.summary.tabCount} windows=${event.summary.windowCount ?? 0} groups=${event.summary.tabGroupCount ?? 0}${event.summary.activePage !== undefined ? ` activePage=${event.summary.activePage}` : ''}`
}
