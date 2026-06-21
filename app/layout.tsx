import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Customers — RM AI Agent",
  description: "View, search, and add customers for relationship management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
