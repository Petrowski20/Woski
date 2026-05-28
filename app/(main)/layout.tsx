import Image from 'next/image';
import Navbar from "@/components/NavBar";
import { Toaster } from 'sonner';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      {/* Marca de agua de fondo — fija, decorativa, sin interacción */}
      <div
        className="fixed inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src="/logo.svg"
          alt=""
          width={700}
          height={688}
          className="opacity-5 grayscale select-none"
          style={{ width: 'auto', height: 'auto' }}
          unoptimized
        />
      </div>

      <Navbar />
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <Toaster position="bottom-center" richColors />
    </>
  );
}
