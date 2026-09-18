import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import ErrorReporter from "@/components/ErrorReporter";
import "../globals.css";

// Runs before React hydrates so a stored dark/light preference applies
// immediately — without this, the page would flash the default (system)
// theme for a moment on every load.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('samnan-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: `${t("appName")} - ${t("appSubtitle")}`,
    description: t("appSubtitle"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={`${cairo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ErrorReporter />
        <ThemeProvider>
          {/* timeZone must be passed explicitly — it isn't inherited from
              next-intl's server request config (see i18n/request.ts).
              Without it, every "use client" page's useFormatter() (ticket/
              complaint history timestamps included) falls back to the
              browser/OS's own timezone instead of Asia/Riyadh, so a device
              set to UTC displayed history times hours off from local time. */}
          <NextIntlClientProvider messages={messages} timeZone="Asia/Riyadh">
            <AuthProvider>{children}</AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
