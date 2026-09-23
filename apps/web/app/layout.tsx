import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aetheria IDX Finance",
  description: "Evidence-first IDX research workflow",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ backgroundColor: "#0b1220" }}>
      <body style={{ backgroundColor: "#0b1220", color: "#e2e8f0", minHeight: "100vh", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
