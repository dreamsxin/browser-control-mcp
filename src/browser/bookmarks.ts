import type { CdpConnection } from '../cdp/connection'
import type {
  BookmarkNode,
  CreateBookmarkParams,
  MoveBookmarkParams,
  UpdateBookmarkParams,
} from '../cdp/generated/domains/bookmarks'
import { bridgeInstallMessage, type ChromeExtensionBridge } from './chrome-extension-bridge'
import type { BackendMode } from './pages'

export type { BookmarkNode }

export class BookmarkManager {
  constructor(
    private readonly cdp: CdpConnection,
    private readonly backend: BackendMode = 'browseros',
    private readonly bridge?: ChromeExtensionBridge,
  ) {}

  async list(folderId?: string): Promise<BookmarkNode[]> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.listBookmarks(folderId)
    }
    const result = await this.cdp.Bookmarks.getBookmarks({
      ...(folderId !== undefined && { folderId }),
    })
    return result.nodes
  }

  async search(query: string, maxResults?: number): Promise<BookmarkNode[]> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.searchBookmarks(query, maxResults)
    }
    const result = await this.cdp.Bookmarks.searchBookmarks({
      query,
      ...(maxResults !== undefined && { maxResults }),
    })
    return result.results
  }

  async get(id: string): Promise<BookmarkNode | undefined> {
    const all = await this.list()
    return all.find((node) => node.id === id)
  }

  async create(params: CreateBookmarkParams): Promise<BookmarkNode> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.createBookmark(params)
    }
    const result = await this.cdp.Bookmarks.createBookmark(params)
    return result.node
  }

  async update(params: UpdateBookmarkParams): Promise<BookmarkNode> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.updateBookmark(params)
    }
    const result = await this.cdp.Bookmarks.updateBookmark(params)
    return result.node
  }

  async move(params: MoveBookmarkParams): Promise<BookmarkNode> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.moveBookmark(params)
    }
    const result = await this.cdp.Bookmarks.moveBookmark(params)
    return result.node
  }

  async remove(id: string): Promise<void> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      await this.bridge!.removeBookmark(id)
      return
    }
    await this.cdp.Bookmarks.removeBookmark({ id })
  }

  private requireBridge(): void {
    if (!this.bridge?.isConnected()) {
      throw new Error(bridgeInstallMessage())
    }
  }
}
