import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const INTEGRATION_URL = 'https://abc123.edge.sdk.awswaf.com/abc123/def456/'
const RESERVATIONS = '/locations/loc-1/reservations'

type ScriptOutcome = 'load' | 'error'
let scriptOutcome: ScriptOutcome
let appendedScripts: HTMLScriptElement[]
const getToken = vi.fn(async () => 'token')

function stubLocation(href: string) {
  const url = new URL(href)
  vi.stubGlobal('location', { ...window.location, href, protocol: url.protocol, hostname: url.hostname })
}

/** Färska moduler per test: botCheck håller sitt läge i modulen. */
async function load(baseUrl = 'https://api.example.com') {
  vi.resetModules()
  const { configureSiteKit } = await import('../config')
  configureSiteKit({ apiBaseUrl: baseUrl })
  const botCheck = await import('./botCheck')
  const api = await import('./api')
  return { ...botCheck, ...api }
}

function okResponse(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function challengeResponse(): Response {
  return new Response('', { status: 202, headers: { 'x-amzn-waf-action': 'challenge' } })
}

beforeEach(() => {
  scriptOutcome = 'load'
  appendedScripts = []
  getToken.mockClear()
  delete window.AwsWafIntegration
  // Skriptet laddas aldrig på riktigt: det som läggs i <head> "laddar" direkt.
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    const script = node as unknown as HTMLScriptElement
    appendedScripts.push(script)
    queueMicrotask(() => {
      if (scriptOutcome === 'load') {
        window.AwsWafIntegration = { getToken, hasToken: () => true }
        script.onload?.(new Event('load'))
      } else {
        script.onerror?.(new Event('error'))
      }
    })
    return node
  })
  stubLocation('https://restaurang.se/boka')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.AwsWafIntegration
})

describe('isBotChecked', () => {
  it('is true only for POST to a guarded path when configured on an https site', async () => {
    const { configureBotCheck, isBotChecked } = await load()
    expect(isBotChecked('POST', RESERVATIONS)).toBe(false)
    configureBotCheck({ integrationUrl: INTEGRATION_URL })
    expect(isBotChecked('POST', RESERVATIONS)).toBe(true)
    expect(isBotChecked('POST', '/order')).toBe(true)
    expect(isBotChecked('POST', '/m/signup')).toBe(true)
    expect(isBotChecked('GET', RESERVATIONS)).toBe(false)
    expect(isBotChecked('GET', '/locations/loc-1/availability?date=2026-11-20')).toBe(false)
    expect(isBotChecked('POST', '/locations/loc-1/reservations/r-1/cancel')).toBe(false)
  })

  it('is false on localhost and on plain http', async () => {
    stubLocation('http://localhost:5173/boka')
    const local = await load()
    local.configureBotCheck({ integrationUrl: INTEGRATION_URL })
    expect(local.isBotChecked('POST', RESERVATIONS)).toBe(false)

    stubLocation('http://restaurang.se/boka')
    const http = await load()
    http.configureBotCheck({ integrationUrl: INTEGRATION_URL })
    expect(http.isBotChecked('POST', RESERVATIONS)).toBe(false)
  })

  it('ignores an integration URL that is not https', async () => {
    const { configureBotCheck, isBotChecked } = await load()
    configureBotCheck({ integrationUrl: 'http://abc.edge.sdk.awswaf.com/' })
    expect(isBotChecked('POST', RESERVATIONS)).toBe(false)
  })
})

describe('the API client with the bot check', () => {
  it('sends a guarded POST to /api on the same origin with the cookie after the script loads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ reservationId: 'r-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiPost } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    await expect(apiPost(RESERVATIONS, { partySize: 2 })).resolves.toEqual({ reservationId: 'r-1' })

    expect(appendedScripts).toHaveLength(1)
    expect(appendedScripts[0].src).toBe(`${INTEGRATION_URL}challenge.js`)
    expect(getToken).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api${RESERVATIONS}`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(String(init.body))).toEqual({ partySize: 2 })
  })

  it('retries once after a WAF challenge', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(okResponse({ orderId: 'o-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiPost } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    await expect(apiPost('/order', {})).resolves.toEqual({ orderId: 'o-1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getToken.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('gives up with bot_check_failed after a second challenge', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => challengeResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiPost, ApiError } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    const err = await apiPost('/order', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, message: 'bot_check_failed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws bot_check_unavailable when the script cannot load, without sending', async () => {
    scriptOutcome = 'error'
    const fetchMock = vi.fn().mockImplementation(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiPost, ApiError } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    const err = await apiPost(RESERVATIONS, {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, message: 'bot_check_unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends other calls to apiBaseUrl without cookies', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiGet, apiPost } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    await apiGet(RESERVATIONS)
    await apiPost('/m/code', { code: 'ABCD-EFGH' })

    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(url.startsWith('https://api.example.com/')).toBe(true)
      expect(init.credentials).toBe('omit')
    }
    expect(getToken).not.toHaveBeenCalled()
  })

  it('sends guarded posts straight to the API on localhost', async () => {
    stubLocation('http://localhost:5173/boka')
    const fetchMock = vi.fn().mockImplementation(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { configureBotCheck, apiPost } = await load()
    configureBotCheck({ integrationUrl: INTEGRATION_URL })

    await apiPost(RESERVATIONS, {})
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.example.com${RESERVATIONS}`)
    expect(init.credentials).toBe('omit')
    expect(appendedScripts).toHaveLength(0)
  })
})
