import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import AdScripts from "@/components/AdScripts";

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
    icon: [
      { url: "/dashboard-logo-32.png", type: "image/png", sizes: "32x32" },
      { url: "/dashboard-logo-64.png", type: "image/png", sizes: "64x64" },
      { url: "/dashboard-logo-128.png", type: "image/png", sizes: "128x128" },
      { url: "/dashboard-logo-192.png", type: "image/png", sizes: "192x192" },
      { url: "/dashboard-logo-256.png", type: "image/png", sizes: "256x256" },
      { url: "/dashboard-logo-512.png", type: "image/png", sizes: "512x512" },
      { url: "/dashboard-logo.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/dashboard-logo-192.png", type: "image/png", sizes: "192x192" }],
    shortcut: [{ url: "/dashboard-logo-256.png", type: "image/png", sizes: "256x256" }],
  },
  manifest: "/manifest.webmanifest",
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
          dangerouslySetInnerHTML={{
            __html: `(function () {
              var lastUserEvent = 0;
              var mark = function () { lastUserEvent = Date.now(); };
              document.addEventListener('click', mark, true);
              document.addEventListener('keydown', mark, true);
              document.addEventListener('touchstart', mark, true);

              function isAllowedUrl(url) {
                try {
                  var isRecent = Date.now() - lastUserEvent < 1500;
                  if (!url || url === 'about:blank') return isRecent;
                  var u = new URL(url, window.location.href);
                  if (u.origin === window.location.origin) return true;
                  var allowedHosts = [
                    'quge5.com',
                    'profitablecpmratenetwork.com',
                    'pl28976126.profitablecpmratenetwork.com',
                    'pagead2.googlesyndication.com',
                    'google.com',
                    'accounts.google.com',
                    'gstatic.com',
                    'googleusercontent.com',
                    'firebaseapp.com',
                    'firebaseauth.com'
                  ];
                  var isAllowedHost = allowedHosts.some(function (host) {
                    return u.hostname === host || u.hostname.endsWith('.' + host);
                  });
                  return isRecent && isAllowedHost;
                } catch (e) {
                  return false;
                }
              }

              var originalOpen = window.open;
              window.open = function (url) {
                if (!isAllowedUrl(url || '')) return null;
                return originalOpen.apply(this, arguments);
              };

              function wrapLocation(method) {
                try {
                  var original = window.location[method].bind(window.location);
                  window.location[method] = function (url) {
                    if (!isAllowedUrl(url || '')) return;
                    return original(url);
                  };
                } catch (e) {}
              }

              wrapLocation('assign');
              wrapLocation('replace');
            })();`
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                if (!window.performance || typeof window.performance.measure !== 'function') return;
                var originalMeasure = window.performance.measure.bind(window.performance);
                window.performance.measure = function () {
                  try {
                    return originalMeasure.apply(window.performance, arguments);
                  } catch (e) {
                    return undefined;
                  }
                };
              } catch (e) {}
            })();`
          }}
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
        <AdScripts />
      </body>
    </html>
  );
}
