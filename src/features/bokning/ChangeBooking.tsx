import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../shared/api'
import { BackButton } from '../../shared/BackButton'
import { FlowSteps } from '../../shared/FlowSteps'
import { SiteContext } from '../../shared/SiteContext'
import { glideTo, prefersReducedMotion } from '../../shared/glide'
import { useLanguage } from '../../shared/lang/LanguageContext'
import { feeLines, fromSnapshot, NOTHING_CHARGED, persons, WAIVER } from '../../shared/bookingTerms'
import { formatPhoneNational } from '../../shared/phone'
import {
  bookableDates,
  bookingErrorMessage,
  confirmChange,
  dayMessage,
  formatDate,
  getChangeOptions,
  holdChange,
  manageLink,
  releaseChange,
  staleSelection,
  tableReasonText,
  todayIn,
} from '../boka/bookingApi'
import type {
  AvailabilitySlot,
  ChangeHold,
  ChangeOptions,
  GuestReservation,
  TableOption,
  TableUnavailable,
} from '../boka/bookingApi'
import {
  DateTiles,
  HoldBanner,
  LargerPartyNote,
  PartyStepper,
  TablePlan,
  TimePills,
} from '../boka/BookingPicker'
import { onlineMaxParty, sameTables, useFloors, useTableLabels } from '../boka/pickerState'
import { GuaranteeStep } from '../boka/GuaranteeStep'
import { PICK_EFFECT_MS, playPickEffect } from '../boka/pickEffect'
import { bookedTables, tableNames, tableTitle } from '../boka/tableNames'

/** Hur ofta tiderna hämtas om medan gästen väljer. */
const REFRESH_MS = 60_000

export const CHANGE_EXPIRED_TEXT = 'Tiden (15 minuter) gick ut och den nya tiden släpptes. Din bokning är kvar som förut.'
/** Den nya tiden hålls inte längre: utgången, släppt när gästen lämnade sidan eller öppnade länken igen. */
export const CHANGE_LET_GO_TEXT = 'Den nya tiden hålls inte längre åt dig. Din bokning är kvar som förut. Välj igen.'
/** changed_retry: personalen ändrade bokningen, eller ett bord hann ändras just då. */
export const CHANGE_OUTDATED_TEXT = 'Bokningen kunde inte ändras just nu. Se hur den ser ut och försök igen.'

/** "fredag 20 november kl 18:00-20:00 · 2 personer · bord 3". */
function line(b: { date: string; startTime: string; endTime: string; partySize: number }, tables: string | null): string {
  return `${formatDate(b.date)} kl ${b.startTime}-${b.endTime} · ${persons(b.partySize)}${tables ? ` · ${tables}` : ''}`
}

/**
 * Ändra bokning (bokningssidan): gästen väljer nytt antal, ny dag, ny tid
 * eller nytt bord med samma bordsval som Boka bord. Tiderna kommer från
 * GET .../change, där bokningens egna bord räknas som lediga. Valet hålls
 * i 15 minuter (POST .../change) medan gästen ser före och efter och den
 * nya avgiften; bokningen är oförändrad tills Bekräfta ändringen
 * (POST .../change/{h}/confirm). Behöver det nya sällskapet kort visas
 * kortsteget först, på samma klocka. Behåll bokningen släpper valet.
 */
export function ChangeBooking({
  booking,
  locationId,
  token,
  onChanged,
  onClose,
  onOutdated,
}: {
  booking: GuestReservation
  locationId: string
  token: string
  /** Bokningen ändrades; `cardSaved` när kortet just lades in. */
  onChanged: (b: GuestReservation, cardSaved: boolean) => void
  /** Gästen behåller bokningen som den är. */
  onClose: () => void
  /** Bokningen kan inte ändras som den ser ut nu: hämta om och visa texten. */
  onOutdated: (text: string) => void
}) {
  const site = useContext(SiteContext)
  const { intlLocale } = useLanguage()
  const loc = site?.config.locations.find((l) => l.locationId === locationId) ?? site?.location ?? null
  const phone = formatPhoneNational(booking.location?.phoneNumber || loc?.phoneNumber || '')
  const rawPhone = booking.location?.phoneNumber || loc?.phoneNumber || undefined
  const timezone = booking.timezone || loc?.timezone
  const today = todayIn(timezone)
  const dates = useMemo(() => bookableDates(today), [today])
  // Backend tar inte emot fler än onlinegränsen, inte heller bokningens eget
  // antal; bokningssidan visar inte Ändra bokning när bokningen är större.
  const maxParty = onlineMaxParty(loc)

  const [partySize, setPartySize] = useState(booking.partySize)
  const [date, setDate] = useState(booking.date)
  const [startTime, setStartTime] = useState<string | null>(booking.startTime)
  const [option, setOption] = useState<TableOption | null>({ tableIds: [...booking.tableIds].sort(), seats: 0 })
  /** Valet är fortfarande bokningens eget (ingen förklaring om det inte går längre). */
  const ownPick = useRef(true)
  /** Nytt antal eller ny dag: tid och bord följer med om de finns kvar, annars släpps de utan förklaring. */
  const carried = useRef(false)
  const selected = useMemo(() => new Set(option?.tableIds ?? []), [option])
  const [refresh, setRefresh] = useState(0)
  const [tick, setTick] = useState(0)
  const key = `${date}|${partySize}`
  const [fetched, setFetched] = useState<{ key: string; options: ChangeOptions | null; error: string | null; retry?: boolean } | null>(null)
  const current = fetched?.key === key ? fetched : null
  const availability = current?.options ?? null
  const loadingSlots = current === null
  const [slotNotice, setSlotNotice] = useState<{ step: 'time' | 'tables'; text: string } | null>(null)
  const [tableInfo, setTableInfo] = useState<string | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('3d')
  const { floors, activeFloor, setFloorId } = useFloors(locationId)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [holding, setHolding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [hold, setHold] = useState<ChangeHold | null>(null)
  const [card, setCard] = useState<{ clientSecret: string; stripeAccount: string; expiresAt: string } | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  const headRef = useRef<HTMLElement>(null)
  const reviewRef = useRef<HTMLLegendElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const tablesRef = useRef<HTMLFieldSetElement>(null)
  const justHeld = useRef(false)

  const latest = useRef({ startTime, option })
  useEffect(() => {
    latest.current = { startTime, option }
  })

  // Tiderna för vald dag och sällskap (och varje minut medan gästen väljer).
  useEffect(() => {
    if (hold) return
    let cancelled = false
    getChangeOptions(locationId, booking.reservationId, token, date, partySize)
      .then((a) => {
        if (cancelled) return
        setFetched({ key, options: a, error: null })
        const cur = latest.current
        const quiet = ownPick.current || carried.current
        carried.current = false
        if (!cur.startTime) return
        const still = a.slots.find((s) => s.startTime === cur.startTime)
        if (!still) {
          setStartTime(null)
          setOption(null)
          if (!quiet) setSlotNotice({ step: 'time', text: `${cur.startTime} går inte att boka längre. Välj en annan tid.` })
          return
        }
        if (cur.option && !(still.options ?? []).some((o) => sameTables(o, cur.option))) {
          setOption(null)
          if (!quiet) setSlotNotice({ step: 'tables', text: 'Bordet du valt har hunnit bokas. Välj bord igen.' })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 409) {
          onOutdated(bookingErrorMessage(err, phone || undefined))
          return
        }
        const refused = err instanceof ApiError && err.status === 400
        setFetched((prev) =>
          !refused && prev?.key === key && prev.options
            ? prev
            : {
                key,
                options: null,
                error: refused ? 'Den dagen går inte att boka online.' : 'Vi kunde inte hämta tiderna just nu.',
                retry: !refused,
              },
        )
      })
    return () => {
      cancelled = true
    }
    // onOutdated och phone ändras inte medan panelen är öppen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, booking.reservationId, token, date, partySize, key, refresh, tick, hold])

  useEffect(() => {
    if (hold) return
    const timer = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [hold])

  // Det som släpps om gästen lämnar sidan: ett hållet val, men inte under
  // kortsteget (Stripe kan skicka gästen till banken och tillbaka hit).
  const holdRef = useRef<ChangeHold | null>(null)
  const expired = useRef(false)
  const onExpire = useRef<() => void>(() => {})
  useEffect(() => {
    holdRef.current = hold && !card ? hold : null
    onExpire.current = () => {
      if (expired.current || !hold) return
      expired.current = true
      void releaseChange(locationId, booking.reservationId, token, hold.holdId).catch(() => undefined)
      backToPicker(CHANGE_EXPIRED_TEXT)
    }
  })

  useEffect(() => {
    if (deadline === null) return
    expired.current = false
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= deadline) onExpire.current()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [deadline])

  // Släppt när sidan lämnades: kommer gästen tillbaka (bakåt/framåt, sidan
  // sparad av webbläsaren) visas väljaren igen, inte en klocka som inte gäller.
  const letGone = useRef(false)
  const onBack = useRef<() => void>(() => {})
  useEffect(() => {
    onBack.current = () => {
      if (!letGone.current) return
      letGone.current = false
      backToPicker(CHANGE_LET_GO_TEXT)
    }
  })
  useEffect(() => {
    const letGo = () => {
      const h = holdRef.current
      if (h) {
        void releaseChange(locationId, booking.reservationId, token, h.holdId, { keepalive: true }).catch(() => undefined)
        letGone.current = true
      }
      holdRef.current = null
    }
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) onBack.current()
    }
    window.addEventListener('pagehide', letGo)
    window.addEventListener('pageshow', back)
    return () => {
      window.removeEventListener('pagehide', letGo)
      window.removeEventListener('pageshow', back)
      letGo()
    }
  }, [locationId, booking.reservationId, token])

  const slots = availability?.slots ?? []
  const slot: AvailabilitySlot | null = slots.find((s) => s.startTime === startTime) ?? null
  const free = useMemo(() => new Map((slot?.tables ?? []).map((t) => [t.tableId, t.seats] as const)), [slot])
  const options = slot?.options ?? []
  const unavailable = useMemo(() => new Map((slot?.unavailable ?? []).map((u) => [u.tableId, u] as const)), [slot])
  const hasCombinations = options.some((o) => o.tableIds.length > 1)
  const day = availability?.day ?? null
  const dayText = dayMessage(day, phone)
  const { nameOf, planLabels } = useTableLabels(floors, slot)
  const cardRequired = Boolean(availability?.cardRequired)
  const nextDate = dates[dates.indexOf(date) + 1] ?? null
  const nowTables = bookedTables(booking)
  const pickedTables = option ? tableNames(option.tableIds.map(nameOf), { word: 'bord' }) : null

  const sameAsBooking =
    date === booking.date && startTime === booking.startTime && partySize === booking.partySize &&
    !!option && option.tableIds.join('+') === [...booking.tableIds].sort().join('+')

  const steps = useMemo(
    () => [
      { label: 'Dag & sällskap' },
      { label: 'Tid' },
      { label: 'Bord' },
      { label: 'Bekräfta' },
      ...((hold ? hold.cardRequired : cardRequired) ? [{ label: 'Kort' }] : []),
    ],
    [cardRequired, hold],
  )
  const stepAt = card ? 5 : hold ? 4 : slot ? 3 : 2

  // Ett nytt val: när klickeffekten spelat klart rullas Ditt val fram.
  useEffect(() => {
    if (!option || hold || ownPick.current) return undefined
    const id = window.setTimeout(() => {
      void glideTo(confirmRef.current, { block: 'nearest' })
    }, prefersReducedMotion() ? 0 : PICK_EFFECT_MS)
    return () => window.clearTimeout(id)
  }, [option, hold])

  // Valet hålls: visa jämförelsen från början och flytta fokus dit.
  useEffect(() => {
    if (!hold || !justHeld.current) return
    justHeld.current = false
    void glideTo(headRef.current, { block: 'start' }).then(() => reviewRef.current?.focus({ preventScroll: true }))
  }, [hold])

  function backToPicker(text: string | null) {
    setHold(null)
    setCard(null)
    setDeadline(null)
    setOption(null)
    setFormError(null)
    setNotice(text)
    setRefresh((n) => n + 1)
    void glideTo(headRef.current, { block: 'start' })
  }

  function choose(change: () => void) {
    ownPick.current = false
    carried.current = false
    change()
    setOption(null)
    setFormError(null)
    setSlotNotice(null)
    setTableInfo(null)
  }

  /** Nytt antal eller ny dag: tiden och bordet behålls om de fortfarande går att välja. */
  function carry(change: () => void) {
    ownPick.current = false
    carried.current = true
    change()
    setFormError(null)
    setSlotNotice(null)
    setTableInfo(null)
  }

  function reasonText(u: TableUnavailable): string {
    return tableReasonText(u, {
      label: nameOf(u.tableId),
      partySize,
      startTime: slot?.startTime ?? '',
      phone,
      hasCombinations,
    })
  }

  function explainTable(tableId: string) {
    const u = unavailable.get(tableId)
    const label = nameOf(tableId)
    setTableInfo(u ? reasonText(u) : `${label ? tableTitle(label) : 'Bordet'} går inte att välja vid den här tiden.`)
  }

  function celebrate(o: TableOption) {
    const chip = tablesRef.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(o.tableIds.join('+'))}"]`)
    playPickEffect(tablesRef.current, o.tableIds, chip)
  }

  function pick(next: TableOption | null) {
    ownPick.current = false
    setSlotNotice(null)
    setFormError(null)
    setTableInfo(null)
    if (next) celebrate(next)
    setOption(next)
  }

  function pickTable(tableId: string) {
    if (option?.tableIds.includes(tableId)) return pick(null)
    pick(
      options.find((o) => o.tableIds.length === 1 && o.tableIds[0] === tableId) ??
        options.find((o) => o.tableIds.includes(tableId)) ??
        null,
    )
  }

  function pickOption(o: TableOption) {
    pick(sameTables(o, option) ? null : o)
  }

  /** Håll det nya valet (15 minuter); bokningen ändras inte än. */
  async function holdPick() {
    if (!slot || !option) {
      setFormError(!slot ? 'Välj en tid.' : 'Välj ett bord.')
      return
    }
    if (cardRequired && !site?.config.stripe.publishableKey) {
      setFormError(bookingErrorMessage(new ApiError(409, 'card_unavailable'), phone || undefined))
      return
    }
    setHolding(true)
    setFormError(null)
    setNotice(null)
    try {
      const held = await holdChange(locationId, booking.reservationId, token, {
        date, startTime: slot.startTime, tableIds: option.tableIds, partySize,
      })
      setHold(held)
      setNow(Date.now())
      setDeadline(Date.now() + held.holdMinutes * 60_000)
      justHeld.current = true
    } catch (err) {
      if (err instanceof ApiError && (err.message === 'not_changeable' || err.message === 'change_closed')) {
        onOutdated(bookingErrorMessage(err, phone || undefined))
        return
      }
      setFormError(bookingErrorMessage(err, phone || undefined))
      const stale = staleSelection(err)
      if (stale) {
        if (stale === 'time') setStartTime(null)
        setOption(null)
        setSlotNotice(null)
        setRefresh((n) => n + 1)
      }
    } finally {
      setHolding(false)
    }
  }

  /** Byt bord: släpp valet och välj igen. */
  function changeTables() {
    if (hold) void releaseChange(locationId, booking.reservationId, token, hold.holdId).catch(() => undefined)
    backToPicker(null)
  }

  /** Behåll bokningen som den är. */
  function keep() {
    if (hold) void releaseChange(locationId, booking.reservationId, token, hold.holdId).catch(() => undefined)
    holdRef.current = null
    onClose()
  }

  /**
   * Fel från Bekräfta ändringen (också efter kortsteget). true när felet
   * lämnar bekräftelsen: tillbaka till väljaren eller till bokningen.
   */
  function leaveOnError(err: unknown): boolean {
    if (!(err instanceof ApiError) || !hold) return false
    if (err.message === 'hold_expired') {
      backToPicker(CHANGE_LET_GO_TEXT)
      return true
    }
    if (err.message === 'changed_retry' || err.message === 'not_changeable' || err.message === 'change_closed') {
      // Backend har oftast släppt valet redan; vid ett bordslås som flyttade
      // sig finns det kvar. Att släppa det igen är ofarligt.
      void releaseChange(locationId, booking.reservationId, token, hold.holdId).catch(() => undefined)
      holdRef.current = null
      onOutdated(err.message === 'changed_retry' ? CHANGE_OUTDATED_TEXT : bookingErrorMessage(err, phone || undefined))
      return true
    }
    return false
  }

  function confirmError(err: unknown) {
    if (!leaveOnError(err)) setFormError(bookingErrorMessage(err, phone || undefined))
  }

  /** Bekräfta ändringen, eller öppna kortsteget när det nya sällskapet kräver kort. */
  async function confirm() {
    if (!hold) return
    setConfirming(true)
    setFormError(null)
    try {
      const result = await confirmChange(locationId, booking.reservationId, token, hold.holdId)
      if (result.kind === 'card') {
        setCard(result.setup)
        window.scrollTo?.({ top: 0, behavior: 'smooth' })
      } else {
        holdRef.current = null
        onChanged(result.booking, false)
      }
    } catch (err) {
      confirmError(err)
    } finally {
      setConfirming(false)
    }
  }

  const heldTables = hold
    ? tableNames(hold.tableIds.map((id, i) => hold.tableLabels?.[i]?.trim() || nameOf(id)), { word: 'bord' })
    : ''
  const banner = hold && secondsLeft !== null && (
    <HoldBanner
      secondsLeft={secondsLeft}
      totalSeconds={hold.holdMinutes * 60}
      tables={heldTables.charAt(0).toUpperCase() + heldTables.slice(1)}
      onChange={card ? undefined : changeTables}
      changeLabel="Välj igen"
      kicker="Den nya tiden är din"
      urgentKicker="Snart släpps den nya tiden"
      finish="Bekräfta ändringen nu."
      label="Tid kvar att bekräfta ändringen"
    />
  )
  const compare = hold && (
    <div className="change-compare">
      <p className="booking-summary-line">
        <span className="summary-kicker">Nu</span>
        <span>{line(booking, nowTables)}</span>
      </p>
      <p className="booking-summary-line is-new" aria-live="polite">
        <span className="summary-kicker">Ny</span>
        <span>{line(hold, heldTables)}</span>
      </p>
    </div>
  )

  if (hold && card) {
    const g = hold.fees
    return (
      <>
        {banner}
        <section className="page-head page-head--rail" ref={headRef}>
          <FlowSteps steps={steps} current={stepAt} label="Ändring" />
        </section>
        <GuaranteeStep
          mode="change"
          booking={{
            ...booking,
            status: 'pending',
            date: hold.date,
            startTime: hold.startTime,
            endTime: hold.endTime,
            partySize: hold.partySize,
            manageToken: token,
            setup: { ...card, expiresAt: card.expiresAt || hold.expiresAt },
            guarantee: g
              ? { cardOnFile: false, noShowFee: g.noShowFee, lateCancelFee: g.lateCancelFee,
                  cancelCutoffHours: g.cancelCutoffHours, currency: g.currency, cancellationFee: 0, freeCancelUntil: null }
              : undefined,
          }}
          locationId={locationId}
          publishableKey={site?.config.stripe.publishableKey ?? null}
          returnUrl={manageLink(window.location.origin, booking, locationId, token)}
          confirm={async () => {
            const result = await confirmChange(locationId, booking.reservationId, token, hold.holdId)
            if (result.kind === 'card') throw new ApiError(409, 'card_not_confirmed')
            return result.booking
          }}
          onConfirmError={leaveOnError}
          onConfirmed={(b) => {
            holdRef.current = null
            onChanged(b, true)
          }}
        >
          {compare}
        </GuaranteeStep>
        <div className="change-keep">
          <button type="button" className="btn-secondary" onClick={keep}>Behåll bokningen som den är</button>
        </div>
      </>
    )
  }

  return (
    <>
      <section className="page-head" ref={headRef}>
        <BackButton onClick={keep}>Tillbaka till bokningen</BackButton>
        <h1>Ändra bokning</h1>
        {!hold && (
          <p className="booking-summary-line change-now">
            <span className="summary-kicker">Nu</span>
            <span>{line(booking, nowTables)}</span>
          </p>
        )}
        <FlowSteps steps={steps} current={stepAt} label="Ändring" />
        {notice && <p className="notice error" role="alert">{notice}</p>}
      </section>

      <div className="booking">
        {!hold && (<>
          <fieldset className="booking-step" disabled={holding}>
            <legend><span className="step-no">1</span>Hur många och när?</legend>
            <PartyStepper id="change-party-size" value={partySize} max={maxParty}
              onChange={(n) => carry(() => setPartySize(n))} />
            <LargerPartyNote max={maxParty} phone={rawPhone} />
            <DateTiles dates={dates} today={today} value={date} intlLocale={intlLocale} specialDays={loc?.specialDays}
              onChange={(d) => carry(() => setDate(d))} />
          </fieldset>

          <fieldset className="booking-step" disabled={holding}>
            <legend><span className="step-no">2</span>Välj tid</legend>
            {loadingSlots && (
              <div className="skeleton-pills" role="status" aria-live="polite">
                <span className="sr-only">Hämtar lediga tider…</span>
                {Array.from({ length: 5 }, (_, i) => <i key={i} aria-hidden="true" />)}
              </div>
            )}
            {current?.error && (
              <div className="notice error notice--stack" role="alert">
                <p>{current.error}</p>
                {current.retry && (
                  <button type="button" className="btn-secondary btn-small" onClick={() => setRefresh((n) => n + 1)}>
                    Försök igen
                  </button>
                )}
              </div>
            )}
            {!loadingSlots && dayText && <p className="notice" role="status">{dayText}</p>}
            {!loadingSlots && !current?.error && slots.length === 0 && (!day || day.kind === 'hours') && (
              <div className="notice notice--stack" role="status">
                <p>{`Inga lediga tider för ${persons(partySize)} ${formatDate(date)}.`}</p>
                {nextDate && (
                  <button type="button" className="btn-secondary btn-small" onClick={() => carry(() => setDate(nextDate))}>
                    Prova nästa dag
                  </button>
                )}
              </div>
            )}
            {slotNotice?.step === 'time' && <p className="notice" role="status">{slotNotice.text}</p>}
            <TimePills slots={slots} value={startTime} onChange={(t) => choose(() => setStartTime(t))} />
          </fieldset>

          {slot && (
            <fieldset className="booking-step" disabled={holding} ref={tablesRef}>
              <legend><span className="step-no">3</span>Välj ert bord</legend>
              {slotNotice?.step === 'tables' && <p className="notice" role="status">{slotNotice.text}</p>}
              <TablePlan
                floors={floors}
                activeFloor={activeFloor}
                onFloor={setFloorId}
                view={view}
                onView={setView}
                free={free}
                selected={selected}
                unavailable={unavailable}
                partySize={partySize}
                planLabels={planLabels}
                onToggle={pickTable}
                onExplain={explainTable}
                tableInfo={tableInfo}
                options={options}
                option={option}
                nameOf={nameOf}
                onPickOption={pickOption}
                reasonText={reasonText}
              />
              {option && (
                <div className="booking-confirm-tables step-enter" ref={confirmRef}>
                  <p className="booking-summary-line" aria-live="polite">
                    <span className="summary-kicker">Ditt val</span>
                    <span>{line({ date, startTime: slot.startTime, endTime: slot.endTime, partySize }, pickedTables)}</span>
                  </p>
                  {formError && <p className="notice error" role="alert">{formError}</p>}
                  <button
                    type="button"
                    className={`btn-primary${holding ? ' is-busy' : ''}`}
                    disabled={holding || sameAsBooking}
                    onClick={() => void holdPick()}
                  >
                    {holding ? <><span className="spinner" aria-hidden="true" />Håller den nya tiden…</> : 'Välj den nya tiden'}
                  </button>
                  {sameAsBooking && <p className="cell-muted">Det här är din bokning nu.</p>}
                </div>
              )}
            </fieldset>
          )}
          {formError && !(slot && option) && <p className="notice error" role="alert">{formError}</p>}
        </>)}

        {banner}

        {hold && (
          <fieldset className="booking-step step-enter" aria-busy={confirming || undefined}>
            <legend ref={reviewRef} tabIndex={-1}><span className="step-no">4</span>Bekräfta ändringen</legend>
            {compare}
            {hold.fees ? (
              <div className="guarantee-notice" role="note">
                <strong>{hold.cardRequired ? 'Kortgaranti krävs' : 'Kortgaranti'}</strong>
                {hold.cardRequired ? ` ${NOTHING_CHARGED}` : null}
                <ul className="guarantee-terms">
                  {feeLines(fromSnapshot(hold.fees, hold.partySize), hold.partySize).map((l) => <li key={l}>{l}</li>)}
                  <li>{WAIVER}</li>
                </ul>
              </div>
            ) : hold.feeText ? (
              <p className="notice" role="note">{hold.feeText}</p>
            ) : null}
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <div className="change-actions">
              <button type="button" className={`btn-primary${confirming ? ' is-busy' : ''}`} disabled={confirming}
                onClick={() => void confirm()}>
                {confirming
                  ? <><span className="spinner" aria-hidden="true" />{hold.cardRequired ? 'Förbereder kortsteget…' : 'Ändrar bokningen…'}</>
                  : hold.cardRequired ? 'Fortsätt till kortgaranti' : 'Bekräfta ändringen'}
              </button>
              <button type="button" className="btn-secondary" disabled={confirming} onClick={keep}>
                Behåll bokningen som den är
              </button>
            </div>
          </fieldset>
        )}
      </div>
    </>
  )
}
