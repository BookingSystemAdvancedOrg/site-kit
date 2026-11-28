import { useEffect, useMemo, useRef } from 'react'
import { Select } from '../../shared/Select'
import { PhoneLink } from '../../shared/PhoneLink'
import type { FloorGroup } from '../../shared/layoutApi'
import type { SpecialDay } from '../../shared/site'
import { clockText, formatDate } from './bookingApi'
import type { AvailabilitySlot, TableOption, TableUnavailable } from './bookingApi'
import { FloorPlanSvg } from './FloorPlanSvg'
import { FloorPlan3D } from './FloorPlan3D'
import { tableNames } from './tableNames'
import { sameTables } from './pickerState'

/**
 * Bitarna i bordsvalet som både Boka bord och Ändra bokning (bokningssidan)
 * använder: antal personer, datumraden, tiderna, planritningen med
 * bordslistan och kvittot som visar hur länge bordet hålls. Samma ord,
 * samma klasser och samma beteende i båda flödena.
 */

/** Veckodag och månad på datumknapparna i gästens språk ("sön", "nov" / "Sun", "Nov"). */
function tileParts(date: string, locale: string): { weekday: string; month: string } {
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(at).replace('.', '')
  return { weekday: fmt({ weekday: 'short' }), month: fmt({ month: 'short' }) }
}

/** Kvittot som hänger kvar högst upp medan bordet hålls: vilket bord, hur
 * länge till (klockan och en remsa som töms) och Byt bord. Under två
 * minuter blir det rött. */
export function HoldBanner({ secondsLeft, totalSeconds, tables, onChange, kicker = 'Bordet är ditt',
  urgentKicker = 'Snart släpps bordet', finish = 'Slutför bokningen nu.', label = 'Tid kvar att slutföra bokningen',
  changeLabel = 'Byt bord' }: {
  secondsLeft: number
  totalSeconds: number
  tables: string
  onChange?: () => void
  /** Rubriken medan det finns tid kvar. */
  kicker?: string
  /** Rubriken de sista två minuterna. */
  urgentKicker?: string
  /** Uppmaningen de sista två minuterna. */
  finish?: string
  /** Klockans namn för skärmläsare. */
  label?: string
  /** Knappen som släpper valet och öppnar väljaren igen. */
  changeLabel?: string
}) {
  const urgent = secondsLeft <= 120
  const left = totalSeconds > 0 ? Math.min(1, Math.max(0, secondsLeft / totalSeconds)) : 0
  return (
    <div className={`hold-banner${urgent ? ' urgent' : ''}`} role="timer" aria-label={`${label}: ${clockText(secondsLeft)}`}>
      <div className="hold-text">
        <span className="hold-kicker">{urgent ? urgentKicker : kicker}</span>
        {/* Hela meningar per textnod (översätts som meningar); klockan för sig. */}
        <span>
          {`${tables} hålls åt dig:`} <strong className="hold-clock" translate="no">{clockText(secondsLeft)}</strong>
          {urgent ? ` ${finish}` : null}
        </span>
      </div>
      {onChange && (
        <button type="button" className="btn-secondary" onClick={onChange}>{changeLabel}</button>
      )}
      <span className="hold-bar" aria-hidden="true"><i style={{ transform: `scaleX(${left})` }} /></span>
    </div>
  )
}

/** Färgförklaringen under planritningen. */
export function FloorLegend() {
  return (
    <ul className="floor-legend" aria-label="Förklaring">
      <li><span className="floor-legend-swatch is-free" aria-hidden="true" />Ledigt</li>
      <li><span className="floor-legend-swatch is-selected" aria-hidden="true" />Ditt val</li>
      <li><span className="floor-legend-swatch is-booked" aria-hidden="true" />Bokat</li>
      <li><span className="floor-legend-swatch is-blocked" aria-hidden="true" />Spärrat</li>
      <li><span className="floor-legend-swatch is-unfit" aria-hidden="true" />Fel storlek</li>
    </ul>
  )
}

/** Antal personer: minus, den märkta listan och plus. */
export function PartyStepper({ id = 'party-size', value, max, onChange }: {
  id?: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="party">
      <label className="party-label" htmlFor={id}>Antal personer</label>
      <div className="party-stepper">
        <button type="button" className="party-btn" aria-label="En person färre"
          disabled={value <= 1} onClick={() => onChange(value - 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <Select
          id={id}
          value={String(value)}
          onChange={(v) => onChange(Number(v))}
          options={Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
            value: String(n),
            label: `${n} ${n === 1 ? 'person' : 'personer'}`,
          }))}
        />
        <button type="button" className="party-btn" aria-label="En person till"
          disabled={value >= max} onClick={() => onChange(value + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}

/** "Fler än 8 personer? Ring 08-123 45 67." */
export function LargerPartyNote({ max, phone }: { max: number; phone?: string }) {
  return (
    <p className="cell-muted">
      {/* One text node per sentence part, so the translator gets the whole question. */}
      {phone
        ? <>{`Fler än ${max} personer? Ring `}<PhoneLink phone={phone} />.</>
        : `Fler än ${max} personer? Ring restaurangen.`}
    </p>
  )
}

/** Datumraden: idag och de bokningsbara dagarna framåt, avvikande dagar märkta. */
export function DateTiles({ dates, today, value, onChange, specialDays, intlLocale }: {
  dates: string[]
  today: string
  value: string
  onChange: (date: string) => void
  specialDays?: SpecialDay[]
  intlLocale: string
}) {
  const specialByDate = useMemo(
    () => new Map((specialDays ?? []).map((d) => [d.date, d] as const)),
    [specialDays],
  )
  // Den valda dagen syns från början (Ändra bokning börjar på bokningens dag,
  // som kan ligga utanför raden på en telefon). Bara raden rullas, inte sidan.
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = rowRef.current
    const tile = row?.querySelector<HTMLElement>('.date-tile.active')
    if (!row || !tile) return
    const left = tile.offsetLeft - row.offsetLeft
    if (left + tile.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - 8
    // bara när raden ritas första gången
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="booking-dates" role="group" aria-label="Välj datum" ref={rowRef}>
      {dates.map((d) => {
        const special = specialByDate.get(d)
        const mark =
          special?.kind === 'closed' ? 'Stängt' : special?.kind === 'no_online' ? 'Ring oss' : null
        return (
          <button
            key={d}
            type="button"
            className={`date-tile${d === value ? ' active' : ''}${mark ? ' is-special' : ''}`}
            title={formatDate(d)}
            aria-pressed={d === value}
            onClick={() => onChange(d)}
          >
            {/* Förkortningar översätts inte ("sön" blev "så långt som"): Intl i gästens språk. */}
            {d === today ? (
              <span className="date-tile-wd">Idag</span>
            ) : (
              <span className="date-tile-wd" translate="no">{tileParts(d, intlLocale).weekday}</span>
            )}
            <span className="date-tile-day">{Number(d.slice(8, 10))}</span>
            {mark ? <span className="pill-note">{mark}</span> : <span className="date-tile-mon" translate="no">{tileParts(d, intlLocale).month}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Tiderna som knappar. */
export function TimePills({ slots, value, onChange }: {
  slots: AvailabilitySlot[]
  value: string | null
  onChange: (startTime: string) => void
}) {
  return (
    <div className="booking-times" role="group" aria-label="Välj tid">
      {slots.map((s) => (
        <button
          key={s.startTime}
          type="button"
          className={`filter-pill${s.startTime === value ? ' active' : ''}`}
          aria-pressed={s.startTime === value}
          onClick={() => onChange(s.startTime)}
        >
          {s.startTime}
        </button>
      ))}
    </div>
  )
}

/**
 * Planritningen (2D/3D, våningar, förklaring) och bordslistan för en vald
 * tid, med förklaringen till bord som inte går att välja.
 */
export function TablePlan({
  floors, activeFloor, onFloor, view, onView, free, selected, unavailable, partySize, planLabels,
  onToggle, onExplain, tableInfo, options, option, nameOf, onPickOption, reasonText,
}: {
  floors: FloorGroup[] | null
  activeFloor: FloorGroup | null
  onFloor: (floorId: string | null) => void
  view: '2d' | '3d'
  onView: (view: '2d' | '3d') => void
  free: Map<string, number>
  selected: Set<string>
  unavailable: Map<string, TableUnavailable>
  partySize: number
  planLabels: Map<string, string>
  onToggle: (tableId: string) => void
  onExplain: (tableId: string) => void
  tableInfo: string | null
  options: TableOption[]
  option: TableOption | null
  nameOf: (id: string) => string | null
  onPickOption: (o: TableOption) => void
  reasonText: (u: TableUnavailable) => string
}) {
  return (
    <>
      {floors === null && (
        <div className="printing printing--inline" role="status" aria-label="Ritar upp lokalen">
          <span className="printing__label">Ritar upp lokalen</span>
          <i /><i /><i />
        </div>
      )}
      {floors && floors.length === 0 && (
        <p className="cell-muted">Planritningen kan inte visas just nu. Välj bord i listan nedanför.</p>
      )}
      {floors && floors.length > 1 && (
        <div className="filter-row" role="group" aria-label="Välj våning">
          {floors.map((g) => (
            <button
              key={g.floor?.floorId ?? 'flat'}
              type="button"
              className={`filter-pill${activeFloor?.floor?.floorId === g.floor?.floorId ? ' active' : ''}`}
              aria-pressed={activeFloor?.floor?.floorId === g.floor?.floorId}
              onClick={() => onFloor(g.floor?.floorId ?? null)}
            >
              {g.floor?.name ?? 'Planritning'}
            </button>
          ))}
        </div>
      )}
      {activeFloor && (
        <>
          <div className="floor-view-toggle" role="group" aria-label="2D eller 3D">
            <button type="button" className={view === '2d' ? 'active' : ''} aria-pressed={view === '2d'} onClick={() => onView('2d')}>2D</button>
            <button type="button" className={view === '3d' ? 'active' : ''} aria-pressed={view === '3d'} onClick={() => onView('3d')}>3D</button>
          </div>
          {view === '2d' ? (
            <FloorPlanSvg
              group={activeFloor}
              ghosts={(floors ?? []).filter((g) => g !== activeFloor)}
              free={free}
              selected={selected}
              onToggle={onToggle}
              unavailable={unavailable}
              onExplain={onExplain}
              partySize={partySize}
              labels={planLabels}
            />
          ) : (
            <FloorPlan3D
              group={activeFloor}
              free={free}
              selected={selected}
              onToggle={onToggle}
              unavailable={unavailable}
              onExplain={onExplain}
              partySize={partySize}
              labels={planLabels}
            />
          )}
          <FloorLegend />
        </>
      )}
      {tableInfo && <p className="notice table-info" role="status">{tableInfo}</p>}
      <div className="booking-table-list" role="group" aria-label="Lediga bord">
        {options.map((o) => (
          <button
            key={o.tableIds.join('+')}
            data-option={o.tableIds.join('+')}
            type="button"
            className={`filter-pill${sameTables(o, option) ? ' active' : ''}`}
            aria-pressed={sameTables(o, option)}
            onClick={() => onPickOption(o)}
          >
            {tableNames(o.tableIds.map(nameOf))} · {o.seats} platser
            {o.tableIds.length > 1 && <span className="pill-note"> · ställs ihop</span>}
          </button>
        ))}
      </div>
      {unavailable.size > 0 && (
        <details className="table-reasons">
          <summary>Varför kan jag inte välja vissa bord? ({unavailable.size})</summary>
          <ul>
            {[...unavailable.values()].map((u) => (
              <li key={u.tableId}>{reasonText(u)}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
