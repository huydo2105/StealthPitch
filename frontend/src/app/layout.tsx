import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "StealthPitch · TEE Agent",
  description:
    "Confidential AI Due-Diligence powered by Trusted Execution Environments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-stealth-bg text-stealth-text`}
      >
        <Providers>
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
              <Header />

              {/* Page Content */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
