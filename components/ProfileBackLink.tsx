'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

// "Volver" del perfil de un jugador. Con un origen explícito (?from ya
// validado en el servidor) va siempre ahí. Sin él, vuelve atrás en el
// historial si la página anterior es de esta web; si no, al destino por
// defecto del deporte.
export default function ProfileBackLink({ href, label, explicit }: { href: string; label: string; explicit: boolean }) {
  const router = useRouter()

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (explicit || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    let sameOrigin = false
    try {
      sameOrigin = document.referrer !== '' && new URL(document.referrer).origin === window.location.origin
    } catch { /* referrer no válido: destino por defecto */ }
    if (sameOrigin && window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors"
    >
      <svg aria-hidden className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </Link>
  )
}
