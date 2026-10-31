import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Triunfo Ensider Group | Administración",
  description:
    "Sistema administrativo de inventario, ventas y control financiero de Triunfo Ensider Group.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
