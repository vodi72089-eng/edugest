import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Toaster } from "sonner";

// Polices AUTO-HÉBERGÉES (src/fonts/, sous-ensemble latin, fichiers variables).
// Pourquoi ? `next/font/google` télécharge les fontes depuis fonts.googleapis.com
// à CHAQUE build — et Turbopack échoue alors de façon intermittente en CI avec
// « next/font/google queries have exactly one entry » (Google renvoie des URLs
// `kit=` différentes entre deux fetch). L'auto-hébergement rend le build
// déterministe, reproductible hors ligne (app desktop) et sans dépendance réseau.
const jakarta = localFont({
  src: "../fonts/PlusJakartaSans-latin-var.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono-latin-var.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

const playfairDisplay = localFont({
  src: [
    {
      path: "../fonts/PlayfairDisplay-latin-var.woff2",
      style: "normal",
      weight: "400 900",
    },
    {
      path: "../fonts/PlayfairDisplay-latin-italic-var.woff2",
      style: "italic",
      weight: "400 900",
    },
  ],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduGest — Gestion Scolaire Premium",
  description: "La plateforme de gestion scolaire multi-écoles qui simplifie la vie des directions, enseignants et parents.",
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'EduGest' },
  icons: {
    icon: "/edugest-logo-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
