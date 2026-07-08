import { z } from 'zod'
import type { BookmarkNode } from '../../browser/bookmarks'
import { defineTool, errorResult, textResult } from './framework'

const ACTIONS = [
  'list',
  'search',
  'create',
  'update',
  'move',
  'delete',
  'open',
] as const

const bookmarkNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  index: z.number().int().optional(),
  title: z.string(),
  url: z.string().optional(),
  type: z.enum(['url', 'folder']),
  dateAdded: z.number(),
  dateLastUsed: z.number().optional(),
})

export const bookmarks = defineTool({
  name: 'bookmarks',
  description:
    'Manage browser bookmarks: list, search, create folders or URL bookmarks, update, move, delete, or open a bookmark.',
  input: z.object({
    action: z.enum(ACTIONS).default('list'),
    folderId: z.string().optional().describe('Folder id for action="list".'),
    query: z.string().optional().describe('Search query for action="search".'),
    maxResults: z.number().int().positive().optional(),
    id: z.string().optional().describe('Bookmark id for update, move, delete, or open.'),
    title: z.string().optional().describe('Bookmark or folder title.'),
    url: z.string().optional().describe('URL for create or update. Omit url to create a folder.'),
    parentId: z.string().optional().describe('Destination parent folder id for create or move.'),
    index: z.number().int().optional().describe('Destination index for create or move.'),
    background: z.boolean().default(true).describe('Open bookmark in a background tab for action="open".'),
  }),
  output: z.object({
    action: z.enum(ACTIONS),
    nodes: z.array(bookmarkNodeSchema).optional(),
    node: bookmarkNodeSchema.optional(),
    page: z.number().int().optional(),
    count: z.number().int().optional(),
  }),
  annotations: { openWorldHint: true, destructiveHint: true },
  handler: async (args, ctx) => {
    switch (args.action) {
      case 'list': {
        const nodes = await ctx.session.bookmarks.list(args.folderId)
        return textResult(formatBookmarkList(nodes), {
          action: 'list',
          nodes,
          count: nodes.length,
        })
      }
      case 'search': {
        if (!args.query) return errorResult('bookmarks search: query is required.')
        const nodes = await ctx.session.bookmarks.search(args.query, args.maxResults)
        return textResult(formatBookmarkList(nodes), {
          action: 'search',
          nodes,
          count: nodes.length,
        })
      }
      case 'create': {
        if (!args.title) return errorResult('bookmarks create: title is required.')
        const node = await ctx.session.bookmarks.create({
          title: args.title,
          ...(args.url !== undefined && { url: args.url }),
          ...(args.parentId !== undefined && { parentId: args.parentId }),
          ...(args.index !== undefined && { index: args.index }),
        })
        return textResult(`created bookmark ${formatBookmarkLine(node)}`, {
          action: 'create',
          node,
        })
      }
      case 'update': {
        if (!args.id) return errorResult('bookmarks update: id is required.')
        if (args.title === undefined && args.url === undefined) {
          return errorResult('bookmarks update: title or url is required.')
        }
        const node = await ctx.session.bookmarks.update({
          id: args.id,
          ...(args.title !== undefined && { title: args.title }),
          ...(args.url !== undefined && { url: args.url }),
        })
        return textResult(`updated bookmark ${formatBookmarkLine(node)}`, {
          action: 'update',
          node,
        })
      }
      case 'move': {
        if (!args.id) return errorResult('bookmarks move: id is required.')
        if (args.parentId === undefined && args.index === undefined) {
          return errorResult('bookmarks move: parentId or index is required.')
        }
        const node = await ctx.session.bookmarks.move({
          id: args.id,
          ...(args.parentId !== undefined && { parentId: args.parentId }),
          ...(args.index !== undefined && { index: args.index }),
        })
        return textResult(`moved bookmark ${formatBookmarkLine(node)}`, {
          action: 'move',
          node,
        })
      }
      case 'delete': {
        if (!args.id) return errorResult('bookmarks delete: id is required.')
        await ctx.session.bookmarks.remove(args.id)
        return textResult(`deleted bookmark ${args.id}`, {
          action: 'delete',
        })
      }
      case 'open': {
        if (!args.id) return errorResult('bookmarks open: id is required.')
        const node = await ctx.session.bookmarks.get(args.id)
        if (!node) return errorResult(`bookmarks open: bookmark ${args.id} not found.`)
        if (!node.url) return errorResult(`bookmarks open: bookmark ${args.id} is a folder.`)
        const page = await ctx.session.pages.newPage(node.url, { background: args.background })
        return textResult(`opened bookmark ${args.id} as page ${page}`, {
          action: 'open',
          node,
          page,
        })
      }
      default:
        return errorResult('bookmarks: unsupported action.')
    }
  },
})

function formatBookmarkList(nodes: BookmarkNode[]): string {
  if (nodes.length === 0) return '(no bookmarks)'
  return nodes.map(formatBookmarkLine).join('\n')
}

function formatBookmarkLine(node: BookmarkNode): string {
  const location = node.url ? ` -> ${node.url}` : ''
  return `[${node.id}] ${node.type} ${node.title}${location}`
}
