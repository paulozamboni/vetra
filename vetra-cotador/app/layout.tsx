import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vetra | Cote seu seguro viagem",
  description: "Planeje a proteção da sua viagem com a Vetra. Informe destino, datas e viajantes para começar.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/vetra-icon.png",
    shortcut: "/vetra-icon.png",
    apple: "/vetra-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
