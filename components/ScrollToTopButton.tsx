'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-5 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-accent bg-accent-gradient text-on-accent shadow-glow-accent hover:brightness-110 disabled:brightness-100 active:scale-95 transition-all"
    >
      <ArrowUp size={18} />
    </button>
  )
}
