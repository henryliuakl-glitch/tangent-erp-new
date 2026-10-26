import type { Metadata, Viewport } from "next"; 
import { Inter } from "next/font/google";
import "./globals.css";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

// ✅ 1. 配置 PWA 相关的元数据及新 Logo
export const metadata: Metadata = {
  title: "Tangent ERP",
  description: "All-in-one Business Management",
  manifest: "/site.webmanifest", // ✅ 更新为新生成的 manifest 文件
  icons: { // ✅ 引入所有新的 favicon 和 apple-touch-icon
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' }
    ],
    apple: [
      { url: '/apple-touch-icon.png' }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tangent ERP",
  },
  formatDetection: {
    telephone: false,
  },
};

// ✅ 2. 配置视口和主题色 (Next.js 14+ 推荐写法)
export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full max-w-full overflow-x-hidden overscroll-none">
      <body className={`${inter.className} bg-slate-50 overflow-x-hidden overscroll-none`}>
        <BusinessProvider>
          {children}
          <Toaster position="top-center" />
        </BusinessProvider>
      </body>
    </html>
  );
}