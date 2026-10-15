import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El calendario de LoL vive ahora en la raíz. Temporal (307) porque /lol
  // puede volver a ser una sección propia cuando haya un segundo deporte.
  // La query (?edicion=) se conserva automáticamente.
  async redirects() {
    return [{ source: '/lol', destination: '/', permanent: false }]
  },
  experimental: {
    serverActions: {
      // Logos de equipo: hasta 2 MB de archivo (utils/lol/teamLogo.ts) más
      // la cabecera multipart. Por defecto son 1 MB. Vercel admite 4,5 MB.
      bodySizeLimit: '3mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
