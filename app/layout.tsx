import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Providers } from "./providers";

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "TaskFlow UEH - Hệ thống quản lý công việc nhóm",
  description: "Nền tảng số giúp sinh viên UEH quản lý công việc nhóm một cách minh bạch, công bằng với hệ thống tính điểm tự động.",
  keywords: ["UEH", "TaskFlow", "quản lý nhóm", "sinh viên", "công việc nhóm"],
  authors: [{ name: "UEH Team" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#006D6F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} ${poppins.variable} antialiased`}>
        <Providers>
          {children}
          <Toaster />
          <Sonner />
        </Providers>
      </body>
    </html>
  );
}
