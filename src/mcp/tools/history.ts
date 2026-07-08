import { z } from 'zod'
import type { HistoryEntry } from '../../browser/history'
import { defineTool, errorResult, textResult } from './framework'

const ACTIONS = ['recent', 'search', 'open', 'delete_url', 'delete_range'] as const

const historyEntrySchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  lastVisitTime: z.number(),
  visitCount: z.number().int(),
  typedCount: z.number().int(),
})

export const history = defineTool({
  name: 'history',
  description:
    'Search, list recent, open, or delete browser history entries for the current browser profile. Use delete actions only when the user explicitly asks to remove history.',
  input: z.object({
    action: z.enum(ACTIONS).default('recent'),
    query: z.string().optional().describe('History search query. Use an empty string only when intentionally listing broadly.'),
    maxResults: z.number().int().positive().optional().describe('Maximum results for action="recent" or action="search".'),
    startTime: z.number().optional().describe('Start time in milliseconds since Unix epoch.'),
    endTime: z.number().optional().describe('End time in milliseconds since Unix epoch.'),
    url: z.string().optional().describe('URL for action="open" or action="delete_url"; use a URL returned by recent/search.'),
    background: z.boolean().default(true).describe('Open history URL in a background tab for action="open".'),
  }),
  output: z.object({
    action: z.enum(ACTIONS),
    entries: z.array(historyEntrySchema).optional(),
    page: z.number().int().optional(),
    count: z.number().int().optional(),
  }),
  annotations: { openWorldHint: true, destructiveHint: true },
  handler: async (args, ctx) => {
    switch (args.action) {
      case 'recent': {
        const entries = await ctx.session.history.recent(args.maxResults)
        return textResult(formatHistoryList(entries), {
          action: 'recent',
          entries,
          count: entries.length,
        })
      }
      case 'search': {
        if (args.query === undefined) return errorResult('history search: query is required.')
        const entries = await ctx.session.history.search({
          query: args.query,
          ...(args.maxResults !== undefined && { maxResults: args.maxResults }),
          ...(args.startTime !== undefined && { startTime: args.startTime }),
          ...(args.endTime !== undefined && { endTime: args.endTime }),
        })
        return textResult(formatHistoryList(entries), {
          action: 'search',
          entries,
          count: entries.length,
        })
      }
      case 'open': {
        if (!args.url) return errorResult('history open: url is required.')
        const page = await ctx.session.pages.newPage(args.url, { background: args.background })
        return textResult(`opened history URL as page ${page}: ${args.url}`, {
          action: 'open',
          page,
        })
      }
      case 'delete_url': {
        if (!args.url) return errorResult('history delete_url: url is required.')
        await ctx.session.history.deleteUrl(args.url)
        return textResult(`deleted history URL ${args.url}`, {
          action: 'delete_url',
        })
      }
      case 'delete_range': {
        if (args.startTime === undefined || args.endTime === undefined) {
          return errorResult('history delete_range: startTime and endTime are required.')
        }
        await ctx.session.history.deleteRange(args.startTime, args.endTime)
        return textResult(`deleted history from ${args.startTime} to ${args.endTime}`, {
          action: 'delete_range',
        })
      }
      default:
        return errorResult('history: unsupported action.')
    }
  },
})

function formatHistoryList(entries: HistoryEntry[]): string {
  if (entries.length === 0) return '(no history entries)'
  return entries.map(formatHistoryLine).join('\n')
}

function formatHistoryLine(entry: HistoryEntry): string {
  const when = new Date(entry.lastVisitTime).toISOString()
  return `[${entry.id}] ${when} (${entry.visitCount} visits) ${entry.title} -> ${entry.url}`
}
