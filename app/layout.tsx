import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Triunfo Ensider Group | Administración",
  description:
    "Sistema administrativo de inventario, ventas y control financiero de Triunfo Ensider Group.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icons/triunfo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/triunfo-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/icons/triunfo-180.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "Triunfo Ensider",
    statusBarStyle: "default",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
