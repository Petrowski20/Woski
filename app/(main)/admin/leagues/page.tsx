import { redirect } from 'next/navigation'
import { adminHref } from '@/utils/admin/tabs'

// Ruta antigua: ahora es una pestaña de /admin (?deporte=…&tab=…).
export default function Page() {
  redirect(adminHref('lol', 'ligas'))
}
