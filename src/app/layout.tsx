import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tianle Cheng | AI Digital Twin",
  description: "Personal website and AI digital twin of Tianle Cheng - Full Stack Developer & AI Enthusiast",
  keywords: ["Tianle Cheng", "AI", "Developer", "Portfolio", "Digital Twin"],
  authors: [{ name: "Tianle Cheng" }],
  openGraph: {
    title: "Tianle Cheng | AI Digital Twin",
    description: "Chat with my AI to learn about my projects and experience",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950`}
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
