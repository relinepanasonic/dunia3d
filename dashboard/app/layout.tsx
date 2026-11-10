import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Nav from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = { title: "Negara Gue", description: "Dashboard, dunia, dan dompet warga Negara Gue." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body><Nav />{children}</body>
    </html>
  );
}
