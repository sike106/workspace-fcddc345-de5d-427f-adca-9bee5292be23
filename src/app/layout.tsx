import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JEE Study Buddy - AI-Powered JEE Preparation Platform",
  description: "Production-grade JEE preparation platform with intelligent AI Buddy, practice tests, mock exams, and personalized analytics. Crack JEE Main & Advanced with AI-powered learning.",
  keywords: ["JEE", "JEE Main", "JEE Advanced", "AI Buddy", "Practice Tests", "Mock Tests", "IIT", "NIT", "Engineering Entrance", "Physics", "Chemistry", "Mathematics"],
  authors: [{ name: "JEE Study Buddy Team" }],
  icons: {
    icon: "/dashboard-logo.svg",
  },
  openGraph: {
    title: "JEE Study Buddy",
    description: "AI-Powered JEE Preparation Platform",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="google-site-verification"
          content="zVxYIbX0rDFt0nU2YsfLh8fSvFb81g4cQKKXt_V4oR0"
        />
        <meta
          name="995b90fd6f777b9263494e4bb15bd186f5c9de5d"
          content="995b90fd6f777b9263494e4bb15bd186f5c9de5d"
        />
        <script
          async
          src="https://www.profitablecpmratenetwork.com/pxw2hw5ur?key=b94c7ccb02ec5960dbcb4a9111298d12"
        />
        <meta name="google-adsense-account" content="ca-pub-6942703237637346" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground relative min-h-screen overflow-x-hidden`}
      >
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              tex: {
                inlineMath: [['\\\\(', '\\\\)'], ['$', '$']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true
              },
              options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
              },
              chtml: {
                scale: 1
              }
            };
          `}
        </Script>
        <Script
          id="mathjax-core"
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
          strategy="beforeInteractive"
        />
        <div className="fixed inset-0 -z-10 bg-linear-to-br from-slate-900 via-blue-950 to-slate-900" />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
