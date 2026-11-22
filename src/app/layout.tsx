import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

const name = process.env.NEXT_PUBLIC_CHURCH_NAME || "The Triumphant Family";

export const metadata: Metadata = {
  title: name,
  description: "The Gleam of Salvation Apostolic Ministry: attendance, QR check-in, altar call, departments and follow-ups.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Triumphant", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before the page paints, so a saved Light or Dark choice never flashes the other theme.
const THEME_SCRIPT = `(function () {
  window.__applyTheme = function (theme) {
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      var dark = theme === "dark" || (theme !== "light" && (meta.media || "").indexOf("dark") !== -1);
      meta.content = dark ? "#000000" : "#f2f2f7";
    });
  };
  try { window.__applyTheme(localStorage.getItem("theme")); } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
