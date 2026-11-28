import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ManageBookingPage from './ManageBookingPage'
import { json, siteConfig } from '../../test/siteData'
import { guestChangeFake } from '../../test/guestChange'
import type { GuestChangeFakeOptions } from '../../test/guestChange'
import { SiteContext } from '../../shared/SiteContext'
import { CARD_REDIRECT_FAILED } from './ManageBookingPage'
import { CHANGE_LET_GO_TEXT, CHANGE_OUTDATED_TEXT } from './ChangeBooking'
import { HoldBanner } from '../boka/BookingPicker'

// Stripe.js is never loaded in tests: a fake Payment Element and stripe.confirmSetup.
const confirmSetup = vi.fn()
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    onReady?.()
    return <div>Kortformulär</div>
  },
  useStripe: () => ({ confirmSetup }),
  useElements: () => ({}),
}))

let fake: ReturnType<typeof guestChangeFake>
let calls: { method: string; path: string; body: unknown }[]

function serve(opts: GuestChangeFakeOptions = {}) {
  fake = guestChangeFake(opts)
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = new URL(url, 'https://api.test')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path: path.pathname + path.search, body })
    const answer = fake.handle(method, path.pathname + path.search, (init?.headers ?? {}) as Record<string, string>, body)
    if (!answer) return json({ error: 'not found' }, 404)
    const res = json(answer.body, answer.status)
    for (const [k, v] of Object.entries(answer.headers ?? {})) res.headers.set(k, v)
    return res
  }))
}

function renderPage() {
  window.location.hash = '#tok'
  const config = siteConfig()
  config.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  return render(
    <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
      <MemoryRouter initialEntries={['/bokning/loc-1/r1']}>
        <Routes>
          <Route path="/bokning/:locationId/:reservationId" element={<ManageBookingPage />} />
        </Routes>
      </MemoryRouter>
    </SiteContext.Provider>,
  )
}

/** Öppna Ändra bokning, gör sällskapet `party` och välj `time` och `table`. */
async function pickChange(user: ReturnType<typeof userEvent.setup>, { more = 1, time = '19:30', table = 'Bord 2 · 4 platser' } = {}) {
  await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
  expect(await screen.findByRole('heading', { name: 'Ändra bokning' })).toBeInTheDocument()
  for (let i = 0; i < more; i++) await user.click(screen.getByRole('button', { name: 'En person till' }))
  await user.click(await within(screen.getByRole('group', { name: 'Välj tid' })).findByRole('button', { name: time }))
  await user.click(await screen.findByRole('button', { name: table }))
  await user.click(screen.getByRole('button', { name: 'Välj den nya tiden' }))
}

beforeEach(() => {
  confirmSetup.mockReset()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
  window.history.replaceState(null, '', '/')
})

describe('Ändra bokning', () => {
  it('starts from the booking as it is: nothing to hold until something changes', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    expect(await screen.findByText('Det här är din bokning nu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Välj den nya tiden' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bord 1 · 2 platser' })).toHaveAttribute('aria-pressed', 'true')
    // the options come from the change route with the manage token, not /availability
    expect(calls.some((c) => c.path.startsWith('/locations/loc-1/reservations/r1/change?date=2026-11-20&partySize=2'))).toBe(true)
    expect(calls.some((c) => c.path.includes('/availability'))).toBe(false)
  })

  it('holds the new pick, shows before and after, and changes the booking on confirm', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/change'))?.body).toEqual({
      date: '2026-11-20', startTime: '19:30', tableIds: ['T2'], partySize: 3,
    })
    expect(await screen.findByRole('timer', { name: /Tid kvar att bekräfta ändringen/ })).toBeInTheDocument()
    expect(screen.getByText(/fredag 20 november kl 18:00-20:00 · 2 personer · bord 1/)).toBeInTheDocument()
    expect(screen.getByText(/fredag 20 november kl 19:30-21:30 · 3 personer · bord 2/)).toBeInTheDocument()
    // no card guarantee for 3 people here: no fee text
    expect(screen.queryByText(/Kortgaranti/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bekräfta ändringen' }))
    expect(await screen.findByText('Bokningen är ändrad. En bekräftelse är på väg till dig.')).toBeInTheDocument()
    expect(screen.getByText('19:30-21:30')).toBeInTheDocument()
    expect(screen.getByText('3 personer')).toBeInTheDocument()
    expect(screen.getByText('bord 2')).toBeInTheDocument()
  })

  it('a larger party that needs a card shows the fees, then the card step, then changes the booking', async () => {
    serve({ cardFrom: 4 })
    confirmSetup.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user, { more: 2, time: '20:00', table: 'Bord 2 · 4 platser' })
    expect(await screen.findByText('Kortgaranti krävs')).toBeInTheDocument()
    expect(screen.getByText('Uteblivet besök: 200 kr/person (800 kr för 4 personer).')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fortsätt till kortgaranti' }))
    expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    expect(screen.getByText(/Restaurangen tar kortgaranti för ert nya sällskap/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
    expect(await screen.findByText('Bokningen är ändrad. En bekräftelse är på väg till dig.')).toBeInTheDocument()
    expect(screen.getByText(/Kortgarantin är sparad/)).toBeInTheDocument()
    expect(screen.getByText('4 personer')).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(2)
  })

  it('a card already on file is restamped: the new fees are shown before confirming', async () => {
    serve({ cardOnFile: true, cardFrom: 4 })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(await screen.findByText('Kortgaranti')).toBeInTheDocument()
    expect(screen.getByText('Uteblivet besök: 200 kr/person (600 kr för 3 personer).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bekräfta ändringen' })).toBeInTheDocument()
  })

  it('Behåll bokningen lets the pick go and keeps the booking as it is', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    await user.click(await screen.findByRole('button', { name: 'Behåll bokningen som den är' }))
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.getByText('18:00-20:00')).toBeInTheDocument()
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && /\/change\/0+1$/.test(c.path))).toBe(true))
    expect(fake.state.booking.partySize).toBe(2)
  })

  it('Välj igen lets the pick go and opens the picker again', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    await user.click(await screen.findByRole('button', { name: 'Välj igen' }))
    expect(await screen.findByRole('group', { name: 'Välj tid' })).toBeInTheDocument()
    await waitFor(() => expect(fake.state.released).toHaveLength(1))
  })

  it('an expired pick goes back to the picker and the booking stays', async () => {
    serve({ failConfirm: 'hold_expired' })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    await user.click(await screen.findByRole('button', { name: 'Bekräfta ändringen' }))
    expect(await screen.findByText(CHANGE_LET_GO_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Välj tid' })).toBeInTheDocument()
  })

  it('a staff change meanwhile reloads the booking and says so', async () => {
    serve({ failConfirm: 'changed_retry' })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    await user.click(await screen.findByRole('button', { name: 'Bekräfta ändringen' }))
    expect(await screen.findByText(CHANGE_OUTDATED_TEXT)).toBeInTheDocument()
    expect(screen.getByText('Bokad')).toBeInTheDocument()
  })

  it('changed_retry from a moving table lock: the pick that is still held is let go', async () => {
    serve({ failConfirm: 'changed_retry', failConfirmKeepsHold: true })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    await user.click(await screen.findByRole('button', { name: 'Bekräfta ändringen' }))
    expect(await screen.findByText(CHANGE_OUTDATED_TEXT)).toBeInTheDocument()
    await waitFor(() => expect(fake.state.released).toEqual(['0'.repeat(31) + '1']))
    expect(fake.state.holds.size).toBe(0)
    expect(fake.state.booking.changeHold).toBeNull()
  })

  it('a table taken by someone else asks for another table', async () => {
    serve({ failHold: 'table_taken' })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(await screen.findByText('Bordet hann bokas av någon annan. Välj ett annat bord eller en annan tid.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('too close to the start: back to the booking with the restaurant to call', async () => {
    serve({ failHold: 'change_closed' })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(await screen.findByText('Det är för nära bokad tid för att ändra här. Ring restaurangen på 08-123 45 67.')).toBeInTheDocument()
    expect(screen.getByText('Bokad')).toBeInTheDocument()
  })

  it('no Ändra bokning when the booking cannot be changed', async () => {
    serve({ changeable: false })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Avboka' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ändra bokning' })).not.toBeInTheDocument()
  })

  it('back from Stripe with an open change: the change is finished', async () => {
    serve({ cardFrom: 4 })
    const first = fake.handle('POST', '/locations/loc-1/reservations/r1/change', { 'X-Manage-Token': 'tok' },
      { startTime: '20:00', tableIds: ['T2'], partySize: 4 })!
    const holdId = (first.body as { holdId: string }).holdId
    fake.handle('POST', `/locations/loc-1/reservations/r1/change/${holdId}/confirm`, { 'X-Manage-Token': 'tok' })
    window.history.replaceState(null, '', '/bokning/loc-1/r1?setup_intent=seti_1&redirect_status=succeeded')
    renderPage()
    expect(await screen.findByText('Bokningen är ändrad. En bekräftelse är på väg till dig.')).toBeInTheDocument()
    expect(screen.getByText('4 personer')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('a page load with a forgotten pick lets it go', async () => {
    serve()
    fake.handle('POST', '/locations/loc-1/reservations/r1/change', { 'X-Manage-Token': 'tok' }, { startTime: '19:30', tableIds: ['T2'], partySize: 3 })
    renderPage()
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    await waitFor(() => expect(fake.state.released).toHaveLength(1))
  })

  it('a party-only change keeps the time and the table when they still fit', async () => {
    serve({ partySize: 3 })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    expect(await screen.findByText('Det här är din bokning nu.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'En person till' }))
    await waitFor(() => expect(calls.some((c) => c.path.includes('partySize=4'))).toBe(true))
    expect(await screen.findByRole('button', { name: 'Bord 2 · 4 platser' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Välj den nya tiden' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Välj den nya tiden' }))
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/change'))?.body).toEqual({
      date: '2026-11-20', startTime: '18:00', tableIds: ['T2'], partySize: 4,
    })
  })

  it('a party that no longer fits the table drops only the table, without a taken-table notice', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    expect(await screen.findByText('Det här är din bokning nu.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'En person till' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true'))
    expect(await screen.findByRole('button', { name: 'Bord 2 · 4 platser' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Välj den nya tiden' })).not.toBeInTheDocument()
    expect(screen.queryByText(/har hunnit bokas/)).not.toBeInTheDocument()
  })

  it('a smaller party above the card threshold, no card on file: confirmed directly, no card step', async () => {
    serve({ partySize: 6, cardFrom: 5 })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    expect(await screen.findByText('Det här är din bokning nu.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'En person färre' }))
    await user.click(await within(screen.getByRole('group', { name: 'Välj tid' })).findByRole('button', { name: '19:30' }))
    await user.click(await screen.findByRole('button', { name: 'Bord 3 · 6 platser' }))
    await user.click(screen.getByRole('button', { name: 'Välj den nya tiden' }))
    expect(await screen.findByRole('button', { name: 'Bekräfta ändringen' })).toBeInTheDocument()
    expect(screen.queryByText(/Kortgaranti/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bekräfta ändringen' }))
    expect(await screen.findByText('Bokningen är ändrad. En bekräftelse är på väg till dig.')).toBeInTheDocument()
    expect(screen.getByText('5 personer')).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(1)
  })

  it('a booking above the online maximum has no Ändra bokning: the restaurant changes it', async () => {
    serve({ partySize: 10 })
    renderPage()
    expect(await screen.findByText('Bokningar för fler än 8 personer ändras av restaurangen.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ändra bokning' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avboka' })).toBeInTheDocument()
    expect(screen.getByText(/Frågor eller ändringar\? Ring/)).toBeInTheDocument()
  })

  it('the picker stops at the online maximum', async () => {
    serve({ partySize: 8 })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    expect(await screen.findByRole('button', { name: 'En person till' })).toBeDisabled()
    expect(screen.getByText(/Fler än 8 personer\? Ring/)).toBeInTheDocument()
  })

  it('too many requests on the pick: the guest waits and tries again, nothing is held', async () => {
    serve({ failHold: 'too_many_requests', failHoldStatus: 429 })
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(await screen.findByText('För många försök. Vänta en stund och försök igen.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Välj den nya tiden' }))
    expect(await screen.findByRole('timer')).toBeInTheDocument()
  })

  it('leaving the page lets the held pick go; back from the browser cache shows the picker again', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await pickChange(user)
    expect(await screen.findByRole('timer')).toBeInTheDocument()
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() => expect(fake.state.released).toHaveLength(1))
    const show = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(show, 'persisted', { value: true })
    window.dispatchEvent(show)
    expect(await screen.findByText(CHANGE_LET_GO_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Välj tid' })).toBeInTheDocument()
  })

  it('Tillbaka till bokningen while a pick is held lets it go', async () => {
    serve()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ändra bokning' }))
    await user.click(screen.getByRole('button', { name: 'En person till' }))
    await user.click(await within(screen.getByRole('group', { name: 'Välj tid' })).findByRole('button', { name: '19:30' }))
    await user.click(await screen.findByRole('button', { name: 'Bord 2 · 4 platser' }))
    await user.click(screen.getByRole('button', { name: 'Välj den nya tiden' }))
    await screen.findByRole('timer')
    await user.click(screen.getByRole('button', { name: 'Tillbaka till bokningen' }))
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    await waitFor(() => expect(fake.state.released).toHaveLength(1))
  })

  describe('confirm errors in the card step', () => {
    async function toCardStep(user: ReturnType<typeof userEvent.setup>) {
      confirmSetup.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
      await pickChange(user, { more: 2, time: '20:00', table: 'Bord 2 · 4 platser' })
      await user.click(await screen.findByRole('button', { name: 'Fortsätt till kortgaranti' }))
      expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    }

    it('hold_expired: back to the picker with the change text, the booking stays', async () => {
      serve({ cardFrom: 4 })
      const user = userEvent.setup()
      renderPage()
      await toCardStep(user)
      fake.state.failConfirm = 'hold_expired'
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText(CHANGE_LET_GO_TEXT)).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Välj tid' })).toBeInTheDocument()
      expect(screen.queryByText(/bordet släpptes. Börja om/)).not.toBeInTheDocument()
    })

    it('changed_retry: the booking is reloaded and the pick let go', async () => {
      serve({ cardFrom: 4, failConfirmKeepsHold: true })
      const user = userEvent.setup()
      renderPage()
      await toCardStep(user)
      fake.state.failConfirm = 'changed_retry'
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText(CHANGE_OUTDATED_TEXT)).toBeInTheDocument()
      expect(screen.getByText('Bokad')).toBeInTheDocument()
      await waitFor(() => expect(fake.state.released).toHaveLength(1))
    })

    it('change_closed: back to the booking with the restaurant to call', async () => {
      serve({ cardFrom: 4 })
      const user = userEvent.setup()
      renderPage()
      await toCardStep(user)
      fake.state.failConfirm = 'change_closed'
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText('Det är för nära bokad tid för att ändra här. Ring restaurangen på 08-123 45 67.')).toBeInTheDocument()
      expect(screen.getByText('Bokad')).toBeInTheDocument()
    })

    it('card_not_confirmed: stays on the card form', async () => {
      serve({ cardFrom: 4, cardNeverConfirmed: true })
      const user = userEvent.setup()
      renderPage()
      await toCardStep(user)
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText('Kortet är inte bekräftat än. Slutför kortuppgifterna och försök igen.')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    })

    it('a network failure after Stripe saved the card: the retry does not confirm the card again', async () => {
      serve({ cardFrom: 4 })
      const user = userEvent.setup()
      renderPage()
      await toCardStep(user)
      fake.state.failConfirm = 'something_else'
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText('Bokningen kunde inte genomföras just nu. Försök igen om en stund.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Spara kortet och ändra' }))
      expect(await screen.findByText('Bokningen är ändrad. En bekräftelse är på väg till dig.')).toBeInTheDocument()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
    })
  })

  describe('back from Stripe (3-D Secure)', () => {
    const open = { startTime: '20:00', tableIds: ['T2'], partySize: 4, cardStepOpened: true }

    it('the bank said no: the pick is let go and the booking stays', async () => {
      serve({ cardFrom: 4, openHold: open })
      window.history.replaceState(null, '', '/bokning/loc-1/r1?setup_intent=seti_1&redirect_status=failed')
      renderPage()
      expect(await screen.findByText(`${CARD_REDIRECT_FAILED} Din bokning är kvar som förut.`)).toBeInTheDocument()
      expect(screen.getByText('2 personer')).toBeInTheDocument()
      await waitFor(() => expect(fake.state.released).toHaveLength(1))
      expect(window.location.search).toBe('')
    })

    it('the card is still not confirmed (202 again): the pick is let go and the booking stays', async () => {
      serve({ cardFrom: 4, openHold: open, cardNeverConfirmed: true })
      window.history.replaceState(null, '', '/bokning/loc-1/r1?setup_intent=seti_1&redirect_status=succeeded')
      renderPage()
      expect(await screen.findByText(`${CARD_REDIRECT_FAILED} Din bokning är kvar som förut.`)).toBeInTheDocument()
      expect(screen.getByText('2 personer')).toBeInTheDocument()
      await waitFor(() => expect(fake.state.released).toHaveLength(1))
    })
  })
})

describe('HoldBanner in a change', () => {
  it('the last two minutes name the new time, not the table', () => {
    render(<HoldBanner secondsLeft={60} totalSeconds={900} tables="Bord 2" onChange={() => {}}
      kicker="Den nya tiden är din" urgentKicker="Snart släpps den nya tiden" changeLabel="Välj igen" />)
    expect(screen.getByText('Snart släpps den nya tiden')).toBeInTheDocument()
    expect(screen.queryByText('Snart släpps bordet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Välj igen' })).toBeInTheDocument()
  })
})
