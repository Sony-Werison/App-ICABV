import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./church-design.css";
import "./modern-ui.css";

export const metadata: Metadata = {
  title: "ICABV | Igreja Cristã no Alto da Boa Vista",
  description: "Pessoas, finanças, escalas e eventos em um só lugar.",
  icons: {
    icon: "/logo-icabv.png",
    shortcut: "/logo-icabv.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <Script id="icabv-theme-init" strategy="beforeInteractive">{`(()=>{try{const saved=localStorage.getItem("icabv-theme");const dark=saved==="dark"||(saved!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light";}catch{}})();`}</Script>
        {children}
      </body>
    </html>
  );
}
