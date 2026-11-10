import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Negara Gue — Dashboard", description: "Status negara: penduduk, pajak, pengaruh, inspirasi." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
