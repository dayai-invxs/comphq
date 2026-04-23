'use client'

import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

// Each HeatCard registers its rows here so the Draggable.onDragEnd handler
// can resolve a drop target (which heat, which index) from raw pointer
// coordinates. The registry is a ref — mutating it doesn't trigger renders.

type RowRegistration = {
  assignmentId: number
  heatNumber: number
  index: number
  el: HTMLElement
}

type DropTarget = { heatNumber: number; index: number }

type HeatDndContextValue = {
  registerRow: (reg: RowRegistration) => () => void
  registerHeatEmpty: (heatNumber: number, el: HTMLElement) => () => void
  resolveDropTarget: (clientX: number, clientY: number, dragId: number) => DropTarget | null
}

const HeatDndContext = createContext<HeatDndContextValue | null>(null)

export function HeatDndProvider({ children }: { children: ReactNode }) {
  const rowsRef = useRef<Map<number, RowRegistration>>(new Map())
  const emptyHeatsRef = useRef<Map<number, HTMLElement>>(new Map())

  const registerRow = useCallback((reg: RowRegistration) => {
    rowsRef.current.set(reg.assignmentId, reg)
    return () => {
      // Only unregister if the entry we wrote is still the one in the map
      // (guards against unmount-after-remount order with the same id).
      const current = rowsRef.current.get(reg.assignmentId)
      if (current && current.el === reg.el) rowsRef.current.delete(reg.assignmentId)
    }
  }, [])

  const registerHeatEmpty = useCallback((heatNumber: number, el: HTMLElement) => {
    emptyHeatsRef.current.set(heatNumber, el)
    return () => {
      const current = emptyHeatsRef.current.get(heatNumber)
      if (current === el) emptyHeatsRef.current.delete(heatNumber)
    }
  }, [])

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number, dragId: number): DropTarget | null => {
      // Pass 1: check for an empty-heat drop zone under the pointer.
      for (const [heatNumber, el] of emptyHeatsRef.current) {
        const rect = el.getBoundingClientRect()
        if (
          clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom
        ) {
          return { heatNumber, index: 0 }
        }
      }

      // Pass 2: find the row closest to the pointer's Y, grouped by heat.
      // Prefer rows under the pointer horizontally; if none, take the nearest Y.
      let best: { reg: RowRegistration; midY: number; horizontalHit: boolean } | null = null
      for (const reg of rowsRef.current.values()) {
        if (reg.assignmentId === dragId) continue
        const rect = reg.el.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        const horizontalHit = clientX >= rect.left && clientX <= rect.right
        if (!best) {
          best = { reg, midY, horizontalHit }
          continue
        }
        // Prefer a horizontal hit over a nearer non-hit.
        if (horizontalHit && !best.horizontalHit) {
          best = { reg, midY, horizontalHit }
          continue
        }
        if (!horizontalHit && best.horizontalHit) continue
        // Same horizontal category: pick nearer Y.
        if (Math.abs(clientY - midY) < Math.abs(clientY - best.midY)) {
          best = { reg, midY, horizontalHit }
        }
      }
      if (!best) return null

      // Above midpoint → insert before this row; below → after.
      const insertIndex = clientY < best.midY ? best.reg.index : best.reg.index + 1
      return { heatNumber: best.reg.heatNumber, index: insertIndex }
    },
    [],
  )

  const value = useMemo<HeatDndContextValue>(
    () => ({ registerRow, registerHeatEmpty, resolveDropTarget }),
    [registerRow, registerHeatEmpty, resolveDropTarget],
  )

  return <HeatDndContext.Provider value={value}>{children}</HeatDndContext.Provider>
}

export function useHeatDnd() {
  const ctx = useContext(HeatDndContext)
  if (!ctx) throw new Error('useHeatDnd must be used inside HeatDndProvider')
  return ctx
}
