import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../shared/api'
import {
  bookingErrorMessage,
  cancelGuestReservation,
  confirmChange,
  confirmGuestReservation,
  formatDate,
  formatFee,
  getGuestReservation,
  lengthText,
  manageLink,
  releaseChange,
} from '../boka/bookingApi'
import type { GuestReservation } from '../boka/bookingApi'
import { GuaranteeConfirmation, GuaranteeStep, GuaranteeTermsText } from '../boka/GuaranteeStep'
import AddToCalendar from '../../shared/AddToCalendar'
import { bookingEvent, restaurantName } from '../../shared/calendar'
import { SiteContext } from '../../shared/SiteContext'
import { SkelLines } from '../../shared/Skeleton'
import { PhoneLink } from '../../shared/PhoneLink'
import { formatPhoneNational } from '../../shared/phone'
import { bookedTables } from '../boka/tableNames'
import { persons } from '../../shared/bookingTerms'
import { onlineMaxParty } from '../boka/pickerState'
import { ChangeBooking, CHANGE_LET_GO_TEXT } from './ChangeBooking'

const STATUS_TEXT: Record<string, string> = {
  pending: 'Inte klar',
  expired: 'Inte slutförd - bordet släpptes',
  reserved: 'Bokad',
  arrived: 'Välkommen!',
  no_show: 'Ej uppdykt',
  no_show_charged: 'Ej uppdykt - avgift debiterad',
  no_show_charge_failed: 'Ej uppdykt',
  cancelled_no_charge: 'Avbokad',
  cancelled_charged: 'Avbokad - avgift debiterad',
  cancelled_charge_failed: 'Avbokad',
  cancelled_by_restaurant: 'Avbokad av restaurangen',
}

/** Token ur länkens #-del (skickas aldrig till servern som URL). */
function tokenFromHash(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ''))
  } catch {
    return ''
  }
}

/** Felet när banken nekade eller gästen avbröt 3-D Secure (Stripe skickar tillbaka hit). */
export const CARD_REDIRECT_FAILED = 'Kortet kunde inte verifieras av banken. Försök igen eller använd ett annat kort.'

/**
 * Tillbaka från Stripe efter 3-D Secure: läser `redirect_status` och tar bort
 * Stripes parametrar ur adressen (klienthemligheten ska inte ligga kvar där).
 * Ger om gästen kom tillbaka från Stripe och felet att visa vid kortformuläret.
 */
function stripeRedirect(): { returned: boolean; error: string | null } {
  const params = new URLSearchParams(window.location.search)
  const status = params.get('redirect_status')
  if (!status && !params.has('setup_intent')) return { returned: false, error: null }
  for (const key of ['setup_intent', 'setup_intent_client_secret', 'redirect_status']) params.delete(key)
  const query = params.toString()
  try {
    window.history.replaceState(window.history.state, '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  } catch {
    // Adressen behålls; felet visas ändå.
  }
  return { returned: true, error: status && status !== 'succeeded' ? CARD_REDIRECT_FAILED : null }
}

/** Ändringen gick igenom (gästen och restaurangen får en bekräftelse). */
const CHANGED_NOTE = { ok: true, text: 'Bokningen är ändrad. En bekräftelse är på väg till dig.' }

/** "kl 18:32" i restaurangens tidszon. */
function clockTime(iso: string, timeZone?: string | null): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(iso))
  try {
    return format(timeZone || 'Europe/Stockholm')
  } catch {
    return format('Europe/Stockholm')
  }
}

/** Bokningens uppgifter (datum, tid, antal, adress). */
function BookingSummary({ booking }: { booking: GuestReservation }) {
  return (
    <dl className="booking-summary">
      {booking.location?.name && <div><dt>Restaurang</dt><dd translate="no">{booking.location.name}</dd></div>}
      <div><dt>Namn</dt><dd translate="no">{booking.customerName}</dd></div>
      <div><dt>Datum</dt><dd>{formatDate(booking.date)}</dd></div>
      <div><dt>Tid</dt><dd>{booking.startTime}-{booking.endTime}</dd></div>
      {lengthText(booking) && <div><dt>Bokningstid</dt><dd>{lengthText(booking)}</dd></div>}
      <div><dt>Antal</dt><dd>{persons(booking.partySize)}</dd></div>
      {bookedTables(booking) && <div><dt>Bord</dt><dd>{bookedTables(booking)}</dd></div>}
      {booking.location?.address && <div><dt>Adress</dt><dd translate="no">{booking.location.address}</dd></div>}
    </dl>
  )
}

/**
 * En påbörjad ändring vid inläsningen. Tillbaka från Stripe efter
 * kortsteget: slutför ändringen (gästen har redan bekräftat). Annars
 * släpps det hållna valet, så borden blir lediga för andra igen.
 */
async function resumeChange(
  b: GuestReservation,
  { locationId, reservationId, token }: { locationId: string; reservationId: string; token: string },
  redirect: { returned: boolean; error: string | null },
): Promise<{
  b: GuestReservation; saved: boolean; note: { ok: boolean; text: string } | null
}> {
  const open = b.changeHold
  if (!open || b.status !== 'reserved') return { b, saved: false, note: null }
  if (!redirect.returned) {
    void releaseChange(locationId, reservationId, token, open.holdId).catch(() => undefined)
    return { b: { ...b, changeHold: null }, saved: false, note: null }
  }
  if (redirect.error) {
    void releaseChange(locationId, reservationId, token, open.holdId).catch(() => undefined)
    return { b: { ...b, changeHold: null }, saved: false,
      note: { ok: false, text: `${redirect.error} Din bokning är kvar som förut.` } }
  }
  try {
    const result = await confirmChange(locationId, reservationId, token, open.holdId)
    if (result.kind === 'changed') {
      return { b: result.booking, saved: !!result.booking.guarantee?.cardOnFile, note: CHANGED_NOTE }
    }
    void releaseChange(locationId, reservationId, token, open.holdId).catch(() => undefined)
    return { b: { ...b, changeHold: null }, saved: false,
      note: { ok: false, text: `${CARD_REDIRECT_FAILED} Din bokning är kvar som förut.` } }
  } catch (err) {
    const text = err instanceof ApiError && err.message === 'hold_expired' ? CHANGE_LET_GO_TEXT : bookingErrorMessage(err)
    return { b: { ...b, changeHold: null }, saved: false, note: { ok: false, text } }
  }
}

/**
 * Gästens egen bokning via länken från bekräftelsen (eller sms:et efter en
 * telefonbokning): /bokning/<plats>/<boknings-id>#<token>. Visar bokningen
 * och låter gästen avboka fram till starttiden. Kräver bokningen kort och
 * är den inte klar (pending med setup) visas samma kortsteg som i
 * bokningsflödet; Stripe skickar tillbaka hit och sidan slutför bokningen.
 */
export default function ManageBookingPage() {
  const { locationId = '', reservationId = '' } = useParams()
  const [token] = useState(tokenFromHash)
  const [booking, setBooking] = useState<GuestReservation | null>(null)
  const [error, setError] = useState<string | null>(
    token ? null : 'Länken är ofullständig. Använd länken från din bokningsbekräftelse.',
  )
  const [confirming, setConfirming] = useState(false)
  const [acceptFee, setAcceptFee] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Kortet sparades just här: visa bekräftelsen av kortgarantin. */
  const [cardSaved, setCardSaved] = useState(false)
  /** Tillbaka från Stripe; nekad eller avbruten 3-D Secure visas vid kortformuläret. */
  const [redirect] = useState(stripeRedirect)
  const cardError = redirect.error
  /** Gästen ändrar bokningen (antal, dag, tid eller bord). */
  const [changing, setChanging] = useState(false)
  /** Vad som hände med en ändring: klar, eller varför bokningen är kvar som förut. */
  const [changeNotice, setChangeNotice] = useState<{ ok: boolean; text: string } | null>(null)
  /** Ökas av "Försök igen" när kortformuläret inte kunde hämtas. */
  const [attempt, setAttempt] = useState(0)
  /** När bokningen senast hämtades (ms): räcker bordets hålltid fortfarande? */
  const [loadedAt, setLoadedAt] = useState(0)
  const feeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getGuestReservation(locationId, reservationId, token)
      // Tillbaka från Stripe (3-D Secure med omdirigering) eller fliken
      // stängdes före bekräftelsen: slutför bokningen om kortet är klart.
      // Annars (kortet inte inlagt än) visas kortsteget om bokningen har ett.
      .then((b) =>
        b.status === 'pending'
          ? confirmGuestReservation(locationId, reservationId, token).then(
              (done) => ({ b: done, saved: done.status !== 'pending' && !!done.guarantee?.cardOnFile, note: null }),
              () => ({ b, saved: false, note: null }),
            )
          : resumeChange(b, { locationId, reservationId, token }, redirect),
      )
      .then(({ b, saved, note }) => {
        if (cancelled) return
        setBooking(b)
        setCardSaved(saved)
        setChangeNotice(note)
        setLoadedAt(Date.now())
      })
      .catch((err: unknown) => !cancelled && setError(bookingErrorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [locationId, reservationId, token, attempt, redirect])

  /** Hämta bokningen igen (efter en ändring som inte gick igenom). */
  function reload(text: string) {
    setChanging(false)
    setChangeNotice({ ok: false, text })
    getGuestReservation(locationId, reservationId, token)
      .then((b) => {
        // Ett val som fortfarande hålls (bordslåset flyttade sig) släpps, så
        // borden blir lediga för andra igen; gästen väljer om.
        if (b.changeHold) void releaseChange(locationId, reservationId, token, b.changeHold.holdId).catch(() => undefined)
        setBooking({ ...b, changeHold: null })
        setLoadedAt(Date.now())
      })
      .catch(() => undefined)
  }

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      setBooking(await cancelGuestReservation(locationId, reservationId, token, acceptFee))
      setConfirming(false)
    } catch (err) {
      // Avgiften kan ha börjat gälla efter att sidan laddades: visa den nya
      // avgiften och rutan att godkänna den, med frågan kvar öppen.
      const newFee = err instanceof ApiError && err.message === 'fee_applies' ? Number(err.body.fee) : NaN
      if (newFee > 0) {
        setBooking((b) => (b?.guarantee ? { ...b, guarantee: { ...b.guarantee, cancellationFee: newFee } } : b))
        setAcceptFee(false)
        // Rutan som behöver kryssas i får fokus när den har ritats.
        requestAnimationFrame(() => feeRef.current?.focus())
      }
      const phone = booking?.location?.phoneNumber
      setError(bookingErrorMessage(err, phone ? formatPhoneNational(phone) : undefined))
    } finally {
      setBusy(false)
    }
  }

  const fee = booking?.guarantee?.cancellationFee ?? 0
  const site = useContext(SiteContext)
  const tenantName = site?.config.tenant.name
  const loc = site?.config.locations.find((l) => l.locationId === locationId) ?? site?.location ?? null
  /** Större än onlinegränsen (bokad per telefon): bara restaurangen kan ändra den. */
  const overOnlineMax = !!booking && booking.partySize > onlineMaxParty(loc)
  const canChange = !!booking?.changeable && booking.status === 'reserved'

  if (booking && changing) {
    return (
      <ChangeBooking
        booking={booking}
        locationId={locationId}
        token={token}
        onChanged={(b, saved) => {
          setBooking(b)
          setCardSaved(saved)
          setChanging(false)
          setChangeNotice(CHANGED_NOTE)
          setLoadedAt(Date.now())
          window.scrollTo?.({ top: 0, behavior: 'smooth' })
        }}
        onClose={() => {
          setChanging(false)
          window.scrollTo?.({ top: 0, behavior: 'smooth' })
        }}
        onOutdated={(text) => {
          reload(text)
          window.scrollTo?.({ top: 0, behavior: 'smooth' })
        }}
      />
    )
  }

  if (booking?.status === 'pending' && booking.setup) {
    const setup = { ...booking.setup, expiresAt: booking.setup.expiresAt || booking.pendingExpiresAt || '' }
    return (
      <GuaranteeStep
        booking={{ ...booking, setup, manageToken: token }}
        locationId={locationId}
        publishableKey={site?.config.stripe.publishableKey ?? null}
        returnUrl={manageLink(window.location.origin, booking, locationId, token)}
        initialError={cardError}
        onConfirmed={(b) => {
          setBooking(b)
          setCardSaved(true)
          window.scrollTo?.({ top: 0, behavior: 'smooth' })
        }}
      >
        <BookingSummary booking={booking} />
      </GuaranteeStep>
    )
  }

  // Väntar på kortet men formuläret kunde inte hämtas från Stripe just nu:
  // bordet hålls fortfarande, så gästen ska försöka igen, inte boka om.
  const held = booking?.status === 'pending' && !!booking.setupUnavailable && !!booking.pendingExpiresAt
    && Date.parse(booking.pendingExpiresAt) > loadedAt

  return (
    <section className="booking-confirmation">
      <h1>Din bokning</h1>
      {!booking && !error && (
        <div className="skel" role="status" aria-label="Hämtar bokningen" aria-busy="true">
          <SkelLines n={5} />
        </div>
      )}
      {error && <p id="manage-booking-error" className="notice error" role="alert">{error}</p>}
      {booking && (
        <>
          <p className="booking-status" aria-live="polite">
            {held ? 'Väntar på kortet' : STATUS_TEXT[booking.status] ?? booking.status}
          </p>
          {changeNotice && (
            <p className={`notice${changeNotice.ok ? ' is-ok' : ' error'}`} role={changeNotice.ok ? 'status' : 'alert'}>
              {changeNotice.text}
            </p>
          )}
          <BookingSummary booking={booking} />
          {booking.status === 'reserved' && booking.cancellable && (
            <AddToCalendar
              event={bookingEvent(booking, {
                restaurant: restaurantName(tenantName, booking.location?.name),
                address: booking.location?.address,
                link: window.location.href,
              })}
            />
          )}
          {held && (
            <div className="notice" role="status">
              <p>
                {`Kortformuläret kunde inte hämtas just nu. Bordet hålls åt dig till kl ${clockTime(booking.pendingExpiresAt!, booking.timezone)}.`}
              </p>
              <button type="button" className="btn-primary" onClick={() => {
                setBooking(null)
                setAttempt((n) => n + 1)
              }}>
                Försök igen
              </button>
            </div>
          )}
          {booking.status === 'pending' && !held && (
            <p className="notice" role="status">
              Bokningen blev inte klar. <Link to="/boka-bord">Gör en ny bokning</Link>.
            </p>
          )}
          {cardSaved ? (
            <GuaranteeConfirmation booking={booking} />
          ) : (
            booking.guarantee?.cardOnFile && booking.cancellable && <GuaranteeTermsText booking={booking} />
          )}
          {booking.fee && booking.fee.status === 'succeeded' && (
            <p className="cell-muted">
              Debiterad avgift: {formatFee(booking.fee.amount)}
              {booking.fee.refundedAmount > 0 && ` (återbetalt ${formatFee(booking.fee.refundedAmount)})`}.
            </p>
          )}
          {!confirming && canChange && overOnlineMax && (
            <p className="notice" role="note">
              {`Bokningar för fler än ${onlineMaxParty(loc)} personer ändras av restaurangen${booking.location?.phoneNumber ? '.' : '. Ring restaurangen.'}`}
            </p>
          )}
          {!confirming && ((canChange && !overOnlineMax) || booking.cancellable) && (
            <div className="booking-actions">
              {canChange && !overOnlineMax && (
                <button type="button" className="btn-primary" onClick={() => {
                  setChangeNotice(null)
                  setChanging(true)
                  window.scrollTo?.({ top: 0 })
                }}>
                  Ändra bokning
                </button>
              )}
              {booking.cancellable && (
                <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
                  Avboka
                </button>
              )}
            </div>
          )}
          {booking.cancellable && confirming && (
            <div className="booking-confirm-cancel" role="group" aria-label="Bekräfta avbokning">
              <p>{`Vill du avboka bordet ${formatDate(booking.date)} kl ${booking.startTime}?`}</p>
              {fee > 0 && (
                <label className="booking-check fee-accept">
                  <input ref={feeRef} type="checkbox" checked={acceptFee} onChange={(e) => setAcceptFee(e.target.checked)}
                    aria-describedby={error ? 'manage-booking-error' : undefined} />
                  <span>
                    Det är mindre än {booking.guarantee!.cancelCutoffHours} timmar kvar. Jag godkänner att{' '}
                    <strong>{formatFee(fee)}</strong> debiteras mitt kort.
                  </span>
                </label>
              )}
              <button type="button" className="btn-primary" disabled={busy || (fee > 0 && !acceptFee)} onClick={() => void cancel()}>
                {busy ? 'Avbokar…' : 'Ja, avboka'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Nej, behåll
              </button>
            </div>
          )}
          {booking.location?.phoneNumber && (
            <p className="cell-muted">
              Frågor eller ändringar? Ring <PhoneLink phone={booking.location.phoneNumber} />.
            </p>
          )}
        </>
      )}
    </section>
  )
}
