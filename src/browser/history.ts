import type { CdpConnection } from '../cdp/connection'
import type { HistoryEntry } from '../cdp/generated/domains/history'
import { bridgeInstallMessage, type ChromeExtensionBridge } from './chrome-extension-bridge'
import type { BackendMode } from './pages'

export type { HistoryEntry }

export class HistoryManager {
  constructor(
    private readonly cdp: CdpConnection,
    private readonly backend: BackendMode = 'browseros',
    private readonly bridge?: ChromeExtensionBridge,
  ) {}

  async search(params: {
    query: string
    maxResults?: number
    startTime?: number
    endTime?: number
  }): Promise<HistoryEntry[]> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.searchHistory(params)
    }
    const result = await this.cdp.History.search(params)
    return result.entries
  }

  async recent(maxResults?: number): Promise<HistoryEntry[]> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      return this.bridge!.getRecentHistory(maxResults)
    }
    const result = await this.cdp.History.getRecent({
      ...(maxResults !== undefined && { maxResults }),
    })
    return result.entries
  }

  async deleteUrl(url: string): Promise<void> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      await this.bridge!.deleteHistoryUrl(url)
      return
    }
    await this.cdp.History.deleteUrl({ url })
  }

  async deleteRange(startTime: number, endTime: number): Promise<void> {
    if (this.backend === 'chrome') {
      this.requireBridge()
      await this.bridge!.deleteHistoryRange(startTime, endTime)
      return
    }
    await this.cdp.History.deleteRange({ startTime, endTime })
  }

  private requireBridge(): void {
    if (!this.bridge?.isConnected()) {
      throw new Error(bridgeInstallMessage())
    }
  }
}
