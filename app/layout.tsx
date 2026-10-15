import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import "./globals.css";
import AppBackground from "@/components/AppBackground";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LangProvider } from "@/contexts/LangContext";
import { getServerLang } from "@/utils/i18n-server";

// latin-ext: diacríticos del rumano (ș, ț) además de tildes y ñ.
const inter = Inter({ subsets: ["latin", "latin-ext"] });
// Títulos (font-display / heading-display en app/styles/theme.css).
const rajdhani = Rajdhani({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
});

export const metadata: Metadata = {
  title: "Woski",
  description: "Predicciones de fútbol y esports entre amigos",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getServerLang();

  return (
    <html lang={lang} className={rajdhani.variable} suppressHydrationWarning>
      <body className={inter.className}>
        <AppBackground />
        <ThemeProvider>
          <LangProvider initialLang={lang}>
            {children}
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
