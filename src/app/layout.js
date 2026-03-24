'use client';

import './globals.css';
import { SessionProvider } from "next-auth/react";
import CookieBanner from "@/components/CookieBanner";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>YieldSwitch AI | Enterprise Quant Trading</title>
        <meta name="description" content="1-Click Auto-Pilot Crypto Trading SaaS" />
      </head>
      <body className="antialiased">
        <SessionProvider>
          {children}
          <CookieBanner />
        </SessionProvider>
      </body>
    </html>
  );
}
