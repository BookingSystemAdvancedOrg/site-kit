import { useEffect, useMemo, useState } from 'react'
import { getPublicActiveLayout, groupElementsByFloor, labelTables } from '../../shared/layoutApi'
import type { FloorGroup, LayoutTableElement } from '../../shared/layoutApi'
import type { AvailabilitySlot, TableOption } from './bookingApi'

/** Bordsvalets tillstånd som Boka bord och Ändra bokning delar (BookingPicker.tsx ritar). */

/** Samma bord (ett bord eller samma kombination)? */
/** Största sällskapet när platsen inte har någon onlinegräns satt. */
const DEFAULT_MAX_PARTY = 12

/** Största sällskapet gästen själv kan boka eller ändra till (platsens onlinegräns). */
export function onlineMaxParty(loc: { maxPartySizeOnline?: number | null } | null | undefined): number {
  return loc?.maxPartySizeOnline || DEFAULT_MAX_PARTY
}

export function sameTables(a: TableOption | null, b: TableOption | null): boolean {
  return Boolean(a && b && a.tableIds.join('+') === b.tableIds.join('+'))
}

/** Planritningens våningar (för bordsvalet); [] när den inte kan visas. */
export function useFloors(locationId: string, enabled = true) {
  const [floors, setFloors] = useState<FloorGroup[] | null>(null)
  const [floorId, setFloorId] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getPublicActiveLayout(locationId)
      .then((layout) => {
        if (cancelled) return
        const groups = groupElementsByFloor(layout)
        setFloors(groups)
        setFloorId(groups[0]?.floor?.floorId ?? null)
      })
      .catch(() => !cancelled && setFloors([]))
    return () => {
      cancelled = true
    }
  }, [enabled, locationId])
  const activeFloor = floors?.find((g) => g.floor?.floorId === floorId) ?? floors?.[0] ?? null
  return { floors, activeFloor, setFloorId }
}

/**
 * Bordens namn vid tiden. Serverns namn (ur tidens layoutversion) går före
 * planritningens (dagens layout): efter ett schemalagt byte av planritning
 * kan ett bord ha ett annat nummer den dagen gästen bokar.
 */
export function useTableLabels(floors: FloorGroup[] | null, slot: AvailabilitySlot | null) {
  const allTables = useMemo(
    () => (floors ?? []).flatMap((g) => g.elements.filter((e): e is LayoutTableElement => e.type === 'table')),
    [floors],
  )
  const labels = useMemo(() => labelTables(allTables), [allTables])
  const serverLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of [...(slot?.tables ?? []), ...(slot?.unavailable ?? [])]) {
      const l = t.label?.trim()
      if (l && !m.has(t.tableId)) m.set(t.tableId, l)
    }
    return m
  }, [slot])
  /** Bordets namn ("3", "Bar") eller null. Aldrig bordets id. */
  const nameOf = (id: string): string | null => serverLabels.get(id) ?? labels.get(id) ?? null
  /** Numren som ritas i planen: samma som i listan. */
  const planLabels = useMemo(
    () => (serverLabels.size > 0 ? new Map([...labels, ...serverLabels]) : labels),
    [labels, serverLabels],
  )
  return { nameOf, planLabels }
}
