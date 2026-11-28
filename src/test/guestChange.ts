import { guestView } from './siteData'

/**
 * En falsk backend för gästens bokningssida med Ändra bokning, utan
 * nätverk: GET .../guest, GET/POST .../change, POST .../change/{h}/confirm
 * och DELETE .../change/{h}, med samma svar som application
 * shared/guest_change.py. Ramverksfri: `handle` tar metod, sökväg och
 * headers och ger { status, body } (eller null för en annan rutt), så att
 * vitest (fetch) och Playwright (page.route) kan använda samma attrapp.
 *
 *   const fake = guestChangeFake({ cardFrom: 5 })
 *   const answer = fake.handle('GET', '/locations/loc-1/reservations/r1/guest', { 'X-Manage-Token': 'tok' })
 */

export interface GuestChangeFakeOptions {
  locationId?: string
  reservationId?: string
  token?: string
  /** Bokningens dag (YYYY-MM-DD); standard 2026-11-20. */
  date?: string
  /** Från hur många personer kort krävs (null = aldrig). */
  cardFrom?: number | null
  /** Bokningen har redan ett sparat kort. */
  cardOnFile?: boolean
  /** Avgifter per person i kr (uteblivet besök, sen avbokning). */
  noShowPerPerson?: number
  lateCancelPerPerson?: number
  /** Bokningens antal personer (standard 2; bordet väljs efter antalet). */
  partySize?: number
  /** Bokningen har cardNeeded (kort krävs fast sällskapet inte växer). */
  cardNeeded?: boolean
  /** Nästa confirm svarar det här felet (409) en gång. */
  failConfirm?: string | null
  /** changed_retry från bordslåset: valet finns kvar (backend låter gästen försöka igen). */
  failConfirmKeepsHold?: boolean
  /** Nästa POST .../change svarar det här felet (409) en gång. */
  failHold?: string | null
  /** Status för failHold (standard 409, t.ex. 429 too_many_requests). */
  failHoldStatus?: number
  /** Kortet bekräftas aldrig: varje confirm i kortsteget svarar 202 igen. */
  cardNeverConfirmed?: boolean
  /** Ett val som redan hålls när sidan öppnas (t.ex. tillbaka från Stripe). */
  openHold?: { date?: string; startTime: string; tableIds: string[]; partySize: number; cardStepOpened?: boolean }
  /** Bokningen kan inte ändras (changeable false). */
  changeable?: boolean
  /** Klockan som hållet räknas från (ms). */
  now?: () => number
}

export interface FakeAnswer {
  status: number
  body: unknown
  /** Svarshuvuden, t.ex. Retry-After på gästens egen spärr (429). */
  headers?: Record<string, string>
}

const TABLES = [
  { tableId: 'T1', seats: 2, label: '1' },
  { tableId: 'T2', seats: 4, label: '2' },
  { tableId: 'T3', seats: 6, label: '3' },
  { tableId: 'T4', seats: 8, label: 'Terrassen' },
]
const TIMES = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30']
const endOf = (t: string) => `${String(Number(t.slice(0, 2)) + 2).padStart(2, '0')}:${t.slice(3)}`
const kr = (n: number) => `${new Intl.NumberFormat('sv-SE').format(n)} kr`

export function guestChangeFake(opts: GuestChangeFakeOptions = {}) {
  const locationId = opts.locationId ?? 'loc-1'
  const reservationId = opts.reservationId ?? 'r1'
  const token = opts.token ?? 'tok'
  const now = opts.now ?? (() => Date.now())
  const noShow = (opts.noShowPerPerson ?? 200) * 100
  const late = (opts.lateCancelPerPerson ?? 100) * 100
  const cardFrom = opts.cardFrom === undefined ? 5 : opts.cardFrom
  const date = opts.date ?? '2026-11-20'
  const party0 = opts.partySize ?? 2
  const tables0 = party0 <= 2 ? ['T1'] : party0 <= 4 ? ['T2'] : party0 <= 6 ? ['T3'] : party0 <= 8 ? ['T4'] : ['T3', 'T4']

  const guarantee = (party: number, cardOnFile: boolean) => ({
    cardOnFile, noShowFee: noShow * party, lateCancelFee: late * party, cancelCutoffHours: 24,
    freeCancelUntil: null, currency: 'sek', cancellationFee: 0,
  })

  const state = {
    booking: {
      reservationId, status: 'reserved', date, startTime: '18:00', endTime: '20:00', timezone: 'Europe/Stockholm',
      partySize: party0, tableIds: tables0, tableLabels: tables0.map((id) => TABLES.find((t) => t.tableId === id)!.label), customerName: 'Anna Andersson',
      cancellable: true, changeable: opts.changeable ?? true, changeHold: null as { holdId: string; expiresAt: string } | null,
      durationMinutes: 120, extendable: false, ruleName: null,
      location: { locationId, name: 'Testkrogen City', address: 'Gatan 1, 111 22 Stockholm', phoneNumber: '+4681234567', email: 'city@testkrogen.se' },
      ...(opts.cardOnFile ? { guarantee: guarantee(party0, true) } : {}),
      ...(opts.cardNeeded ? { cardNeeded: { since: '2026-11-01T10:00:00Z' } } : {}),
    } as Record<string, unknown> & {
      partySize: number; date: string; startTime: string; tableIds: string[]
      changeHold: { holdId: string; expiresAt: string } | null
    },
    holds: new Map<string, Record<string, unknown> & { holdId: string; cardRequired: boolean; partySize: number }>(),
    /** Hållen vars kortsteg öppnats: nästa confirm lyckas (kortet är "inlagt"). */
    cardStep: new Set<string>(),
    released: [] as string[],
    confirmed: [] as string[],
    failConfirm: opts.failConfirm ?? null,
    failHold: opts.failHold ?? null,
  }

  const cardOnFile = () => Boolean((state.booking.guarantee as { cardOnFile?: boolean } | undefined)?.cardOnFile)
  /** shared/guest_change.py card_step_needed: inget kort sparat, kort krävs för sällskapet och det växer (eller cardNeeded). */
  const cardNeeded = (party: number) =>
    cardFrom !== null && party >= cardFrom && !cardOnFile() &&
    (party > state.booking.partySize || Boolean(state.booking.cardNeeded))

  function options(day: string, party: number) {
    // Någon annan har bord 2 kl 19:00 (inte bokningens eget bord).
    const slots = TIMES.map((t) => ({
      startTime: t, endTime: endOf(t), layoutVersion: 1, durationMinutes: 120, extendable: false, ruleName: null,
      tables: TABLES.filter((x) => !(t === '19:00' && x.tableId === 'T2')),
      ...(t === '19:00' ? { unavailable: [{ tableId: 'T2', reason: 'booked', label: '2' }] } : {}),
    }))
    return { ...guestView({ locationId, date: day, timezone: 'Europe/Stockholm', slots }, party), cardRequired: cardNeeded(party) }
  }

  const fees = (party: number) =>
    cardOnFile() || cardNeeded(party)
      ? { noShowFee: noShow * party, lateCancelFee: late * party, noShowFeePerPerson: noShow / 100,
          lateCancelFeePerPerson: late / 100, cancelCutoffHours: 24, currency: 'sek' }
      : null

  const base = `/locations/${locationId}/reservations/${reservationId}`
  let seq = 0

  type PickBody = { date?: string; startTime?: string; tableIds?: string[]; partySize?: number }

  function pick(req: PickBody): FakeAnswer {
    const b = state.booking
    const next = {
      date: req.date ?? b.date, startTime: req.startTime ?? b.startTime,
      tableIds: [...(req.tableIds ?? b.tableIds)].sort(), partySize: req.partySize ?? b.partySize,
    }
    if (next.date === b.date && next.startTime === b.startTime && next.partySize === b.partySize
      && next.tableIds.join('+') === [...b.tableIds].sort().join('+')) {
      return { status: 400, body: { error: 'nothing to change' } }
    }
    const prev = b.changeHold?.holdId
    if (prev) state.holds.delete(prev)
    seq += 1
    const holdId = String(seq).padStart(32, '0')
    const expiresAt = new Date(now() + 15 * 60_000).toISOString()
    const f = fees(next.partySize)
    const hold = {
      holdId, expiresAt, holdMinutes: 15, ...next, endTime: endOf(next.startTime),
      tableLabels: next.tableIds.map((id) => TABLES.find((t) => t.tableId === id)?.label ?? ''),
      durationMinutes: 120, cardRequired: cardNeeded(next.partySize), fees: f,
      feeText: f ? `Avgift vid uteblivet besök: ${kr(f.noShowFee / 100)}.` : '',
    }
    state.holds.set(holdId, hold)
    b.changeHold = { holdId, expiresAt }
    return { status: 201, body: hold }
  }

  function handle(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): FakeAnswer | null {
    const url = new URL(path, 'https://api.test')
    const p = url.pathname
    if (!p.startsWith(base)) return null
    const tok = headers['X-Manage-Token'] ?? headers['x-manage-token']
    if (tok !== token) return { status: 404, body: { error: 'not found' } }
    const rest = p.slice(base.length)
    if (method === 'GET' && rest === '/guest') return { status: 200, body: state.booking }
    if (rest === '/change' && method === 'GET') {
      const party = Number(url.searchParams.get('partySize') ?? state.booking.partySize)
      return { status: 200, body: options(url.searchParams.get('date') ?? state.booking.date, party) }
    }
    if (rest === '/change' && method === 'POST') {
      if (state.failHold) {
        const error = state.failHold
        state.failHold = null
        const status = opts.failHoldStatus ?? 409
        // Backendens spärr per gäst svarar med lång Retry-After (klienten försöker inte om).
        return { status, body: { error }, ...(status === 429 ? { headers: { 'Retry-After': '60' } } : {}) }
      }
      return pick((body ?? {}) as PickBody)
    }
    const confirm = rest.match(/^\/change\/([^/]+)\/confirm$/)
    if (confirm && method === 'POST') {
      const holdId = confirm[1]
      if (state.confirmed.includes(holdId)) return { status: 200, body: state.booking }
      if (state.failConfirm) {
        const error = state.failConfirm
        state.failConfirm = null
        const kept = error === 'changed_retry' && opts.failConfirmKeepsHold
        if ((error === 'hold_expired' || error === 'changed_retry') && !kept) {
          state.holds.delete(holdId)
          if (state.booking.changeHold?.holdId === holdId) state.booking.changeHold = null
        }
        return { status: 409, body: { error } }
      }
      const hold = state.holds.get(holdId)
      if (!hold || Date.parse(String(hold.expiresAt)) <= now()) return { status: 409, body: { error: 'hold_expired' } }
      if (hold.cardRequired && (!state.cardStep.has(holdId) || opts.cardNeverConfirmed)) {
        state.cardStep.add(holdId)
        return { status: 202, body: { cardRequired: true, holdId, expiresAt: hold.expiresAt,
          setup: { clientSecret: 'seti_change_secret_fake', stripeAccount: 'acct_fake', expiresAt: hold.expiresAt } } }
      }
      const withCard = cardOnFile() || hold.cardRequired
      state.booking = {
        ...state.booking,
        date: hold.date, startTime: hold.startTime, endTime: hold.endTime, partySize: hold.partySize,
        tableIds: hold.tableIds, tableLabels: hold.tableLabels, changeHold: null,
        ...(withCard ? { guarantee: guarantee(hold.partySize, true) } : {}),
      } as typeof state.booking
      state.holds.delete(holdId)
      state.confirmed.push(holdId)
      return { status: 200, body: { ...state.booking, changed: true } }
    }
    const release = rest.match(/^\/change\/([^/]+)$/)
    if (release && method === 'DELETE') {
      const holdId = release[1]
      const released = state.holds.delete(holdId)
      if (released) state.released.push(holdId)
      if (state.booking.changeHold?.holdId === holdId) state.booking.changeHold = null
      return { status: 200, body: { released } }
    }
    return null
  }

  if (opts.openHold) {
    const { cardStepOpened, ...seed } = opts.openHold
    const held = pick(seed).body as { holdId: string }
    if (cardStepOpened) state.cardStep.add(held.holdId)
  }

  return { state, handle }
}
