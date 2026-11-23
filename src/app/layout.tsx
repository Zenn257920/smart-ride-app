import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Innovix SharedRide Myanmar",
  description:
    "လမ်းကြောင်းနဲ့ အချိန်တူ ခရီးသည်တွေနဲ့ ချိတ်ဆက်ပေးတဲ့ Carpooling — ရန်ကုန်မြို့",
  manifest: "/manifest.webmanifest",
  themeColor: "#1E4927",
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("smartride_theme")||"light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="my" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} antialiased min-h-screen flex flex-col`}>
        <Nav />
        <main className="flex-1 min-w-0">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
