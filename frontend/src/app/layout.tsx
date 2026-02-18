import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

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
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* NDA Banner */}
            <div className="flex-shrink-0 px-6 py-3">
              <div className="mx-auto max-w-3xl rounded-xl bg-stealth-gold/10 border border-stealth-gold/20 px-4 py-2.5 text-center text-sm text-stealth-gold">
                🔒 Responses governed by cryptographic NDA · Raw IP will never
                be disclosed
              </div>
            </div>

            {/* Page Content */}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
