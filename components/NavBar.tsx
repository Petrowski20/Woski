import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { createClient } from '@/utils/supabase/server';
import UserDropdown from '@/components/UserDropdown';
import MobileMenu from '@/components/MobileMenu';
import { NAV_LINKS, ADMIN_HREF } from '@/components/navLinks';
import { getServerLang, tServer } from '@/utils/i18n-server';

export default async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const lang = await getServerLang();
  const t = (key: string) => tServer(lang, key);

  let nickname = '';
  let role = 'PLAYER';
  let avatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, nickname, avatar_url')
      .eq('id', user.id)
      .single();

    role      = profile?.role ?? 'PLAYER';
    nickname  = profile?.nickname ?? '';
    avatarUrl = profile?.avatar_url ?? null;
  }

  // Sin backdrop-filter en la barra: crearía un bloque contenedor para sus hijos
  // fixed (menú móvil, overlay y cierre del desplegable) y los encerraría en ella.
  return (
    <nav className="bg-bg-surface/95 border-b border-border sticky top-0 z-40 shadow-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          <div className="flex space-x-8">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center rounded-md" aria-label="Woski, inicio">
                <BrandLogo size="sm" />
              </Link>
            </div>

            <div className="hidden md:flex space-x-4 items-center">
              {NAV_LINKS.map(({ href, labelKey }) => (
                <Link key={href} href={href} className="text-sm font-medium text-text-muted hover:text-accent px-3 py-2 rounded-md transition-colors">
                  {t(labelKey)}
                </Link>
              ))}
              {/* Solo visibilidad: /admin comprueba el rol en el servidor */}
              {role === 'ADMIN' && (
                <Link href={ADMIN_HREF} className="text-sm font-semibold text-secondary hover:bg-secondary/10 px-3 py-2 rounded-md transition-colors">
                  Admin
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {user ? (
              <UserDropdown avatarUrl={avatarUrl} nickname={nickname} role={role} />
            ) : (
              <Link
                href="/login"
                className="text-sm font-semibold text-on-accent bg-accent bg-accent-gradient hover:brightness-110 disabled:brightness-100 px-4 py-2 rounded-lg transition-all shadow-glow-accent"
              >
                {t('nav.iniciarSesion')}
              </Link>
            )}
            <MobileMenu isAdmin={role === 'ADMIN'} />
          </div>

        </div>
      </div>
    </nav>
  );
}
