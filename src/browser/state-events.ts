import type { BrowserSession } from './session'
import type { PageInfo } from './pages'
import type { WindowInfo } from './windows'
import type { TabGroup } from './tab-groups'

export const BROWSER_STATE_RESOURCE_URI = 'browser://state'

export type BrowserStateEventReason =
  | 'snapshot'
  | 'tabs'
  | 'windows'
  | 'tabGroups'
  | 'tool'
  | 'extension'
  | 'connection'

export interface BrowserStateEvent {
  type: 'browser.state.changed'
  seq: number
  reason: BrowserStateEventReason
  changedAt: string
  summary: BrowserStateSummary
}

export interface BrowserStateSummary {
  tabCount: number
  windowCount?: number
  tabGroupCount?: number
  activePage?: number
  activeTabId?: number
  activeWindowId?: number
}

export interface BrowserStateSnapshot {
  seq: number
  capturedAt: string
  backend: BrowserSession['backend']
  summary: BrowserStateSummary
  pages: BrowserStatePage[]
  windows: WindowInfo[]
  tabGroups: BrowserStateTabGroup[]
}

export interface BrowserStatePage {
  page: number
  targetId: string
  tabId: number
  url: string
  title: string
  isActive: boolean
  isLoading: boolean
  loadProgress: number
  isPinned: boolean
  isHidden: boolean
  windowId?: number
  index?: number
  groupId?: string
  browserContextId?: string
}

export interface BrowserStateTabGroup extends Omit<TabGroup, 'tabIds'> {
  tabIds: number[]
  pageIds: number[]
}

type BrowserStateListener = (event: BrowserStateEvent) => void | Promise<void>

interface Waiter {
  sinceSeq: number
  resolve: (event: BrowserStateEvent) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  onAbort?: () => void
}

export class BrowserStateEvents {
  private seq = 0
  private lastEvent?: BrowserStateEvent
  private readonly listeners = new Set<BrowserStateListener>()
  private readonly waiters = new Set<Waiter>()

  currentSeq(): number {
    return this.seq
  }

  getLastEvent(): BrowserStateEvent | undefined {
    return this.lastEvent
  }

  onChange(listener: BrowserStateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(reason: BrowserStateEventReason, summary: BrowserStateSummary): BrowserStateEvent {
    const event: BrowserStateEvent = {
      type: 'browser.state.changed',
      seq: ++this.seq,
      reason,
      changedAt: new Date().toISOString(),
      summary,
    }
    this.lastEvent = event
    this.resolveWaiters(event)
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch(() => {})
    }
    return event
  }

  waitForChange(
    sinceSeq: number | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserStateEvent> {
    const floor = sinceSeq ?? this.seq
    if (this.lastEvent && this.lastEvent.seq > floor) {
      return Promise.resolve(this.lastEvent)
    }
    if (signal?.aborted) return Promise.reject(abortError(signal.reason))

    return new Promise<BrowserStateEvent>((resolve, reject) => {
      const waiter: Waiter = {
        sinceSeq: floor,
        resolve: (event) => {
          cleanup()
          resolve(event)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
        signal,
        timer: setTimeout(() => {
          waiter.reject(new Error(`Timed out waiting for browser state change after ${timeoutMs}ms.`))
        }, timeoutMs),
      }
      const cleanup = () => {
        clearTimeout(waiter.timer)
        if (waiter.onAbort && waiter.signal) {
          waiter.signal.removeEventListener('abort', waiter.onAbort)
        }
        this.waiters.delete(waiter)
      }
      waiter.onAbort = () => waiter.reject(abortError(signal?.reason))
      signal?.addEventListener('abort', waiter.onAbort, { once: true })
      this.waiters.add(waiter)
    })
  }

  async snapshot(session: BrowserSession): Promise<BrowserStateSnapshot> {
    const [pages, windowsResult, groupsResult] = await Promise.allSettled([
      session.pages.list(),
      session.windows.list(),
      session.tabGroups.list(),
    ])
    const pagesValue = pages.status === 'fulfilled' ? pages.value : []
    const windowsValue = windowsResult.status === 'fulfilled' ? windowsResult.value : []
    const groupsValue = groupsResult.status === 'fulfilled' ? groupsResult.value : []
    const summary = summarizeState(pagesValue, windowsValue, groupsValue)

    return {
      seq: this.seq,
      capturedAt: new Date().toISOString(),
      backend: session.backend,
      summary,
      pages: pagesValue.map(structuredPage),
      windows: windowsValue,
      tabGroups: groupsValue.map((group) => ({
        ...group,
        pageIds: pagesValue
          .filter((page) => page.groupId === group.groupId)
          .map((page) => page.pageId),
      })),
    }
  }

  async emitSnapshot(
    reason: BrowserStateEventReason,
    session: BrowserSession,
  ): Promise<BrowserStateEvent> {
    const snapshot = await this.snapshot(session)
    return this.emit(reason, snapshot.summary)
  }

  private resolveWaiters(event: BrowserStateEvent): void {
    for (const waiter of [...this.waiters]) {
      if (event.seq > waiter.sinceSeq) waiter.resolve(event)
    }
  }
}

export function summarizeState(
  pages: PageInfo[],
  windows: WindowInfo[] = [],
  tabGroups: TabGroup[] = [],
): BrowserStateSummary {
  const activePage = pages.find((page) => page.isActive)
  const activeWindow = windows.find((window) => window.isActive)
  return {
    tabCount: pages.length,
    windowCount: windows.length,
    tabGroupCount: tabGroups.length,
    ...(activePage && {
      activePage: activePage.pageId,
      activeTabId: activePage.tabId,
      ...(activePage.windowId !== undefined && { activeWindowId: activePage.windowId }),
    }),
    ...(activeWindow && { activeWindowId: activeWindow.windowId }),
  }
}

function structuredPage(page: PageInfo): BrowserStatePage {
  return {
    page: page.pageId,
    targetId: page.targetId,
    tabId: page.tabId,
    url: page.url,
    title: page.title,
    isActive: page.isActive,
    isLoading: page.isLoading,
    loadProgress: page.loadProgress,
    isPinned: page.isPinned,
    isHidden: page.isHidden,
    ...(page.windowId !== undefined && { windowId: page.windowId }),
    ...(page.index !== undefined && { index: page.index }),
    ...(page.groupId !== undefined && { groupId: page.groupId }),
    ...(page.browserContextId !== undefined && { browserContextId: page.browserContextId }),
  }
}

function abortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason
  const error = new Error(reason === undefined ? 'The operation was aborted.' : String(reason))
  error.name = 'AbortError'
  return error
}
