import './globals.css';
import Providers from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";

export const metadata = {
  title: "YieldSwitch AI | Enterprise Quant Trading",
  description: "1-Click Auto-Pilot Crypto Trading SaaS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
