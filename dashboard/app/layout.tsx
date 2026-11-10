import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Nav from "@/components/Nav";
import { getBrand } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const revalidate = 60;

export async function generateMetadata() {
  const brand = await getBrand();
  return { title: brand, description: `Dashboard, dunia, dan dompet warga ${brand}.` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <html lang="id" className={inter.variable}>
      <body><Nav brand={brand} />{children}</body>
    </html>
  );
}
