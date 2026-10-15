// Regla del proxy para usuarios con app_metadata.must_change_password:
// solo pueden estar en la página de cambio de contraseña (y en /login)
// hasta que la cambien. Cerrar sesión no pasa por aquí: lo hace el
// cliente directamente contra Supabase Auth.

export const CHANGE_PASSWORD_PATH = '/perfil/contrasena'

const ALLOWED_PREFIXES = [CHANGE_PASSWORD_PATH, '/login', '/_next/']

// Recursos estáticos que el matcher del proxy no excluye ya.
const STATIC_FILE = /\.(?:ico|txt|xml|webmanifest|json|css|js|map|woff2?|ttf)$/i

export type GateDecision = 'pass' | 'redirect' | 'block'

function isAllowedPath(pathname: string) {
  return ALLOWED_PREFIXES.some(p =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/'),
  )
}

export function passwordChangeGate(opts: {
  pathname: string
  mustChangePassword: boolean
  isServerAction: boolean
}): GateDecision {
  const { pathname, mustChangePassword, isServerAction } = opts
  if (!mustChangePassword) return 'pass'
  if (isAllowedPath(pathname)) return 'pass'
  if (!pathname.startsWith('/api/') && STATIC_FILE.test(pathname)) return 'pass'
  // Una Server Action espera su respuesta, no una redirección a HTML.
  return isServerAction ? 'block' : 'redirect'
}
