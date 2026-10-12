import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CardSource, DropTarget } from './battle-interaction'

export type DragState = { source: CardSource; x: number; y: number; target: DropTarget | null }
type Gesture = { source: CardSource; x: number; y: number; pointerId: number; element: HTMLElement; moved: boolean }

export function useCardDrag({ enabled, epoch, validTarget, commit, onStart }: {
  enabled: boolean; epoch: number; validTarget: (source: CardSource, target: DropTarget) => boolean;
  commit: (source: CardSource, target: DropTarget) => void; onStart: () => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef<HTMLElement | null>(null)
  const cancel = () => {
    const active = gesture.current
    gesture.current = null
    setDrag(null)
    if (active?.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId)
  }
  const hit = (source: CardSource, x: number, y: number): DropTarget | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-player]')
    if (!element) return null
    const target: DropTarget = { playerId: element.dataset.dropPlayer!, zone: element.dataset.dropZone === 'deck' ? 'deck' : element.dataset.dropZone === 'role' ? 'role' : 'player' }
    return validTarget(source, target) ? target : null
  }
  useEffect(() => { cancel() }, [enabled, epoch])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', hidden)
      const active = gesture.current
      gesture.current = null
      if (active?.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId)
    }
  }, [])
  const bindings = (source: CardSource) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      suppressClick.current = null
      if (!enabled || !event.isPrimary || event.button !== 0) return
      gesture.current = { source, x: event.clientX, y: event.clientY, pointerId: event.pointerId, element: event.currentTarget, moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const active = gesture.current
      if (!active || event.pointerId !== active.pointerId) return
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 8) return
      if (!active.moved) { active.moved = true; suppressClick.current = active.element; onStart() }
      event.preventDefault()
      setDrag({ source: active.source, x: event.clientX, y: event.clientY, target: hit(active.source, event.clientX, event.clientY) })
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const active = gesture.current
      if (!active || event.pointerId !== active.pointerId) return
      const target = active.moved && enabled ? hit(active.source, event.clientX, event.clientY) : null
      cancel()
      if (target) commit(active.source, target)
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onDragStart: (event: React.DragEvent) => event.preventDefault(),
  })
  const consumeClick = (element: HTMLElement) => { const suppressed = suppressClick.current === element; suppressClick.current = null; return suppressed }
  return { drag, bindings, consumeClick, cancel }
}
