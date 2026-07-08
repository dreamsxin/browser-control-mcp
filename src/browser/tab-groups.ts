import type { CdpConnection } from '../cdp/connection'
import { bridgeInstallMessage, type ChromeExtensionBridge } from './chrome-extension-bridge'
import type { BackendMode } from './pages'

export interface TabGroup {
  groupId: string
  windowId: number
  title: string
  color: string
  collapsed: boolean
  tabIds: number[]
}

export class TabGroupManager {
  constructor(
    private readonly cdp: CdpConnection,
    private readonly backend: BackendMode = 'browseros',
    private readonly bridge?: ChromeExtensionBridge,
  ) {}

  async list(): Promise<TabGroup[]> {
    if (this.backend === 'browseros') {
      const { groups } = (await this.cdp.rawSend('Browser.getTabGroups')) as {
        groups: TabGroup[]
      }
      return groups
    }
    this.requireBridgeSnapshot()
    return this.bridge!.listGroups()
  }

  async create(tabIds: number[], title?: string): Promise<TabGroup> {
    if (this.backend === 'browseros') {
      const { group } = (await this.cdp.rawSend('Browser.createTabGroup', {
        tabIds,
        ...(title !== undefined && { title }),
      })) as { group: TabGroup }
      return group
    }
    this.requireBridge()
    return this.bridge!.createTabGroup({ tabIds, title })
  }

  async addTabsToGroup(groupId: string, tabIds: number[]): Promise<TabGroup> {
    if (this.backend === 'browseros') {
      const { group } = (await this.cdp.rawSend('Browser.addTabsToGroup', {
        groupId,
        tabIds,
      })) as { group: TabGroup }
      return group
    }
    this.requireBridge()
    return this.bridge!.addTabsToGroup({ groupId, tabIds })
  }

  async update(
    groupId: string,
    opts: { title?: string; color?: string; collapsed?: boolean },
  ): Promise<TabGroup> {
    if (this.backend === 'browseros') {
      const { group } = (await this.cdp.rawSend('Browser.updateTabGroup', {
        groupId,
        ...(opts.title !== undefined && { title: opts.title }),
        ...(opts.color !== undefined && { color: opts.color }),
        ...(opts.collapsed !== undefined && { collapsed: opts.collapsed }),
      })) as { group: TabGroup }
      return group
    }
    this.requireBridge()
    return this.bridge!.updateTabGroup({ groupId, ...opts })
  }

  async removeTabsFromGroup(tabIds: number[]): Promise<void> {
    if (this.backend === 'browseros') {
      await this.cdp.rawSend('Browser.removeTabsFromGroup', { tabIds })
      return
    }
    this.requireBridge()
    await this.bridge!.removeTabsFromGroup(tabIds)
  }

  async close(groupId: string): Promise<void> {
    if (this.backend === 'browseros') {
      await this.cdp.rawSend('Browser.closeTabGroup', { groupId })
      return
    }
    this.requireBridge()
    await this.bridge!.closeTabGroup(groupId)
  }

  private requireBridge(): void {
    if (!this.bridge?.isConnected()) {
      throw new Error(bridgeInstallMessage())
    }
  }

  private requireBridgeSnapshot(): void {
    if (!this.bridge?.hasSnapshot()) {
      throw new Error(bridgeInstallMessage())
    }
  }
}
