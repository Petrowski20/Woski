import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { passwordChangeGate, CHANGE_PASSWORD_PATH } from '@/utils/auth/passwordGate'

const PUBLIC_PATHS = ['/login']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida el token contra el servidor de Supabase Auth en cada request.
  // Si el usuario fue eliminado o el token está revocado, devuelve user=null.
  // No colocar ninguna lógica entre createServerClient y getUser().
  const { data: { user }, error } = await supabase.auth.getUser()

  // Las Server Actions comprueban la sesión por su cuenta y devuelven un error
  // controlado ("sesión caducada"). Redirigirlas a /login aquí haría que el
  // cliente recibiera HTML en vez de la respuesta de la acción.
  const isServerAction = request.method === 'POST' && request.headers.has('next-action')

  if ((error || !user) && !isPublicPath(request.nextUrl.pathname) && !isServerAction) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)

    // Borra las cookies de sesión de Supabase para evitar sesiones fantasma en el navegador.
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith('sb-')) {
        redirectResponse.cookies.delete(cookie.name)
      }
    })

    return redirectResponse
  }

  // Contraseña reiniciada por un admin: solo puede cambiarla (o salir).
  // getUser() lee app_metadata del servidor de Auth, no del JWT, así que
  // el flag vale también para sesiones abiertas antes del reinicio.
  const gate = passwordChangeGate({
    pathname: request.nextUrl.pathname,
    mustChangePassword: user?.app_metadata?.must_change_password === true,
    isServerAction,
  })

  if (gate !== 'pass') {
    const url = request.nextUrl.clone()
    url.pathname = CHANGE_PASSWORD_PATH
    url.search = ''
    const response = gate === 'redirect'
      ? NextResponse.redirect(url)
      : new NextResponse('Cambio de contraseña pendiente', { status: 403 })
    // Conserva las cookies de sesión que haya refrescado getUser().
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
    return response
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
