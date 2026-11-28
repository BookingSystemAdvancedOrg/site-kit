import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Plate } from './Plate'
import { allergenText, menuImagePosition, menuImageUrl } from '../features/meny/menuApi'
import { DIETARY_LABEL } from '../features/catering/cateringApi'

/**
 * En rätt i en egen ruta: stort foto (eller tallriken med första bokstaven),
 * hela beskrivningen, kost och allergener och priset. Samma ruta för menyn
 * och cateringen; priset kommer som färdig text, så cateringen visar sitt
 * eget pris (per portion eller per gäst). `children` blir rutans fot, till
 * exempel cateringens antal. På telefon glider rutan upp nerifrån.
 *
 * Fokus flyttas in när rutan öppnas, Tab stannar i den, Escape stänger och
 * fokus går tillbaka dit den kom ifrån. Sidan bakom scrollar inte.
 */
export function DishSheet({
  name,
  description,
  imageKey,
  imageFocus,
  allergens,
  dietary,
  priceText,
  onClose,
  children,
}: {
  name: string
  description?: string | null
  /** Menybildens nyckel (menu-images/...); utan den visas tallriken. */
  imageKey?: string | null
  imageFocus?: { x: number; y: number } | null
  /** EU-allergener som koder (ALLERGEN_LABEL). */
  allergens?: string[]
  /** Kost som koder (DIETARY_LABEL). */
  dietary?: string[]
  priceText: string
  onClose: () => void
  children?: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  const src = menuImageUrl(imageKey)
  const [failed, setFailed] = useState(false)
  const allergenLine = allergenText(allergens)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && panelRef.current.contains(active)
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prev
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return createPortal(
    <div className="opening-hours-modal-root dish-sheet-root">
      <button type="button" className="opening-hours-modal-backdrop" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div
        ref={panelRef}
        className="opening-hours-modal-panel dish-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="opening-hours-modal-header">
          <h2 id={titleId} className="opening-hours-modal-heading dish-sheet-name" translate="no">{name}</h2>
          <button ref={closeRef} type="button" className="opening-hours-modal-close" onClick={onClose} aria-label="Stäng">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {src && !failed ? (
          <div className="dish-sheet-photo">
            <img
              src={src}
              alt={name}
              decoding="async"
              style={{ objectPosition: menuImagePosition(imageFocus) }}
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          <div className="dish-sheet-plate">
            <Plate src={null} name={name} size="lg" />
          </div>
        )}
        {description && <p className="dish-sheet-desc">{description}</p>}
        {(dietary?.length || allergenLine) && (
          <div className="dish-sheet-tags">
            {dietary?.length ? (
              <p className="dish-tags">
                {dietary.map((d) => <span key={d} className="dish-tag">{DIETARY_LABEL[d] ?? d}</span>)}
              </p>
            ) : null}
            {allergenLine && <p className="dish-allergens">{allergenLine}</p>}
          </div>
        )}
        <p className="dish-sheet-price">{priceText}</p>
        {children && <div className="dish-sheet-foot">{children}</div>}
      </div>
    </div>,
    document.body,
  )
}
