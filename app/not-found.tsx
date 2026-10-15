import Link from 'next/link';
import { getServerLang, tServer } from '@/utils/i18n-server';

export default async function NotFound() {
  const lang = await getServerLang();
  const t = (key: string) => tServer(lang, key);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-elevated border border-border rounded-panel shadow-raised p-10 text-center">

        <div className="font-display text-8xl font-bold text-accent tracking-tight leading-none dark:[text-shadow:0_0_24px_var(--glow-accent-soft)]">
          404
        </div>

        <div className="mt-3 text-4xl">⛳</div>

        <h1 className="heading-display mt-4 text-2xl font-bold text-text-primary">
          {t('notFound.title')}
        </h1>

        <p className="mt-3 text-sm text-text-muted leading-relaxed">
          {t('notFound.desc')}
        </p>

        <Link
          href="/"
          className="mt-8 inline-block w-full py-3 px-6 rounded-xl bg-accent bg-accent-gradient text-on-accent font-semibold text-sm hover:brightness-110 transition-all border border-transparent shadow-glow-accent"
        >
          {t('notFound.volver')}
        </Link>

      </div>
    </div>
  );
}
