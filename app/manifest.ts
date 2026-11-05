import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Triunfo Ensider Group",
    short_name: "Triunfo Ensider",
    description: "Administración de inventario, ventas y control financiero.",
    lang: "es-PE",
    start_url: "/sistema",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ec681b",
    icons: [
      { src: "/icons/triunfo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/triunfo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/triunfo-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
