import type { WindowInfo } from '../cdp/generated/domains/browser'
import type { CdpConnection } from '../cdp/connection'
import { bridgeInstallMessage, type ChromeExtensionBridge } from './chrome-extension-bridge'
import type { BackendMode } from './pages'

export type { WindowInfo }

export interface SetWindowVisibilityResult {
  window: WindowInfo
  replaced: boolean
  previousWindowId: number
  newWindowId: number
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const UNSUPPORTED = (method: string): Error =>
  new Error(
    `Window management (${method}) is not supported on standard Chrome. ` +
    'This capability requires BrowserOS custom CDP domains (Browser.getWindows, etc.).',
  )

/**
 * Wraps BrowserOS window CDP commands for browser-core callers and tools.
 *
 * In 'browseros' mode: full functionality via Browser.getWindows/createWindow/etc.
 * In 'chrome' mode: all methods throw UnsupportedError (standard Chrome has no window management CDP).
 */
export class WindowManager {
  constructor(
    private readonly cdp: CdpConnection,
    private readonly backend: BackendMode = 'browseros',
    private readonly bridge?: ChromeExtensionBridge,
  ) {}

  async list(): Promise<WindowInfo[]> {
    if (this.backend === 'chrome') {
      if (!this.bridge?.hasSnapshot()) throw new Error(bridgeInstallMessage())
      return this.bridge.listWindows()
    }
    await this.ensureConnected()
    const result = await this.cdp.Browser.getWindows()
    return result.windows as WindowInfo[]
  }

  async create(opts?: { hidden?: boolean }): Promise<WindowInfo> {
    if (this.backend === 'chrome') {
      if (!this.bridge?.isConnected()) throw new Error(bridgeInstallMessage())
      return this.bridge.createWindow(opts)
    }
    await this.ensureConnected()
    const result = await this.cdp.Browser.createWindow({ hidden: opts?.hidden ?? false })
    return result.window as WindowInfo
  }

  async close(windowId: number): Promise<void> {
    if (this.backend === 'chrome') {
      if (!this.bridge?.isConnected()) throw new Error(bridgeInstallMessage())
      await this.bridge.closeWindow(windowId)
      return
    }
    await this.ensureConnected()
    await this.cdp.Browser.closeWindow({ windowId })
  }

  async activate(windowId: number): Promise<void> {
    if (this.backend === 'chrome') {
      if (!this.bridge?.isConnected()) throw new Error(bridgeInstallMessage())
      await this.bridge.activateWindow(windowId)
      return
    }
    await this.ensureConnected()
    await this.cdp.Browser.activateWindow({ windowId })
  }

  async setVisibility(
    windowId: number,
    opts: { visible: boolean; activate?: boolean },
  ): Promise<SetWindowVisibilityResult> {
    if (this.backend === 'chrome') {
      if (!this.bridge?.isConnected()) throw new Error(bridgeInstallMessage())
      const window = await this.bridge.setWindowVisibility(windowId, opts)
      return {
        window,
        replaced: false,
        previousWindowId: windowId,
        newWindowId: windowId,
      }
    }
    await this.ensureConnected()
    const result = await this.cdp.Browser.setWindowVisibility({
      windowId,
      visible: opts.visible,
      ...(opts.activate !== undefined && { activate: opts.activate }),
    })
    return {
      ...result,
      newWindowId: result.window.windowId,
    } as SetWindowVisibilityResult
  }

  private async ensureConnected(): Promise<void> {
    if (!this.cdp.isConnected()) {
      const deadline = Date.now() + 5000
      while (!this.cdp.isConnected() && Date.now() < deadline) {
        await delay(50)
      }
      if (!this.cdp.isConnected()) throw new Error('CDP not connected')
    }
  }
}
