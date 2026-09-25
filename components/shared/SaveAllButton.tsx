'use client'

import { Loader2, Save } from 'lucide-react'

interface Props {
  count: number
  saving: boolean
  onClick: () => void
}

// Botón flotante "Guardar N predicciones" compartido (Mundial y LoL).
// Se coloca a la izquierda del botón "volver arriba" para no solaparse.
export default function SaveAllButton({ count, saving, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="fixed bottom-6 right-18 z-30 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-success text-on-accent shadow-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? 'Guardando…' : `Guardar ${count} predicciones`}
    </button>
  )
}
