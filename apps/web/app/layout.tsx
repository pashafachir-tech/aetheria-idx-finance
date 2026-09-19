import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aetheria IDX Finance",
  description: "Evidence-first IDX research workflow",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
