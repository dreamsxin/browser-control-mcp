import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const DEFAULT_CHROME_PATHS = [
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/**
 * Launch a Chrome/BrowserOS process with remote debugging enabled.
 * Waits up to 10s for the CDP endpoint to become available.
 */
export async function launchChrome(
  cdpPort: number,
  chromePath?: string,
  opts: {
    userDataDir?: string
    extensionPath?: string
  } = {},
): Promise<void> {
  const exe =
    chromePath ??
    DEFAULT_CHROME_PATHS.find((p) => existsSync(p))

  if (!exe) {
    throw new Error(
      'Chrome not found. Use --chrome-path or start Chrome manually with --remote-debugging-port.',
    )
  }

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]

  if (opts.userDataDir) {
    args.push(`--user-data-dir=${resolve(opts.userDataDir)}`)
  }

  if (opts.extensionPath) {
    const extensionPath = resolve(opts.extensionPath)
    args.push(`--load-extension=${extensionPath}`)
    args.push(`--disable-extensions-except=${extensionPath}`)
    args.push('--enable-unsafe-extension-debugging')
  }

  console.error(`[browser-control-mcp] Launching: ${exe} ${args.join(' ')}`)

  const child = spawn(
    exe,
    args,
    { stdio: 'ignore', detached: true },
  )
  child.unref()

  // Wait for CDP to be ready (poll /json/version)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        console.error('[browser-control-mcp] Chrome CDP is ready')
        return
      }
    } catch {
      // Chrome not ready yet, keep waiting
    }
    await delay(500)
  }

  throw new Error(`Chrome did not start within 10s on port ${cdpPort}`)
}
