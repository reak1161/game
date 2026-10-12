import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function CardPopover({ anchor, title, caption, description, children, onClose, onEnter, onLeave }: {
  anchor: HTMLElement; title: string; caption: string; description: string; children?: ReactNode;
  onClose: () => void; onEnter: () => void; onLeave: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) return onClose()
      const box = anchor.getBoundingClientRect()
      const popup = ref.current!.getBoundingClientRect()
      const left = Math.max(10, Math.min(window.innerWidth - popup.width - 10, box.left + box.width / 2 - popup.width / 2))
      const preferred = box.top > popup.height + 20 ? box.top - popup.height - 12 : box.bottom + 12
      setPosition({ left, top: Math.max(10, Math.min(window.innerHeight - popup.height - 10, preferred)) })
    }
    const outside = (event: PointerEvent) => {
      const node = event.target as Node
      if (!ref.current?.contains(node) && !anchor.contains(node)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { anchor.focus(); onClose() } }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [anchor, title, caption, description, children, onClose])
  return createPortal(<div ref={ref} id="card-popover" className="card-popover" role="dialog" aria-label={title} style={position}
    onPointerEnter={onEnter} onPointerLeave={onLeave} onFocus={onEnter} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onLeave() }}>
    <button className="popover-close" onClick={() => { anchor.focus(); onClose() }} aria-label="説明を閉じる">×</button>
    <small>{caption}</small><h2>{title}</h2><p>{description}</p>{children}
  </div>, document.body)
}
