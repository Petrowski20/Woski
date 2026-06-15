import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/server';
import UserDropdown from '@/components/UserDropdown';
import MobileMenu from '@/components/MobileMenu';
import { getServerLang, tServer } from '@/utils/i18n-server';

export default async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const lang = await getServerLang();
  const t = (key: string) => tServer(lang, key);

  let isAdmin = false;
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
    isAdmin   = role === 'ADMIN';
    nickname  = profile?.nickname ?? '';
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          <div className="flex space-x-8">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo.svg"
                  alt="PollaMundialista"
                  width={36}
                  height={35}
                  className="block md:hidden w-auto h-auto dark:brightness-0 dark:invert"
                  style={{ width: 'auto', height: 'auto' }}
                  unoptimized
                  priority
                />
                <Image
                  src="/titulo.svg"
                  alt="PollaMundialista"
                  width={160}
                  height={47}
                  className="hidden md:block w-auto h-auto dark:brightness-0 dark:invert"
                  style={{ width: 'auto', height: 'auto' }}
                  unoptimized
                  priority
                />
              </Link>
            </div>

            <div className="hidden md:flex space-x-4 items-center">
              <Link href="/" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.home')}
              </Link>
              <Link href="/clasificacion" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.clasificacion')}
              </Link>
              <Link href="/supuestos" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.miMundial')}
              </Link>
              <Link href="/selecciones" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.selecciones')}
              </Link>
              <Link href="/ligas" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.ligasPrivadas')}
              </Link>
              <Link href="/premios" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                🏅 Premios
              </Link>
              <Link href="/reglas" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-blue px-3 py-2 rounded-md transition-colors">
                {t('nav.comoJugar')}
              </Link>
              {isAdmin && (
                <Link href="/admin" className="text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 px-3 py-2 rounded-md transition-colors">
                  🛡️ Admin
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
                className="text-sm font-semibold text-white bg-gradient-to-r from-brand-blue to-brand-teal hover:from-brand-cyan hover:to-brand-mint px-4 py-2 rounded-lg transition-all shadow-sm"
              >
                {t('nav.iniciarSesion')}
              </Link>
            )}
            <MobileMenu isAdmin={isAdmin} />
          </div>

        </div>
      </div>
    </nav>
  );
}
