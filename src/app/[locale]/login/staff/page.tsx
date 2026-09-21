"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginCharacters from "@/components/LoginCharacters";
import { IconEye, IconEyeOff } from "@/components/icons";

// A simple cartoon hand — three overlapping circles as fingers sitting on a
// rounded-rectangle palm. Sits at the outer corners of the card, as if
// holding it open; travels with the card during the sign-in reveal below.
function Hand({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg width="70" height="100" viewBox="0 0 90 130" className={flip ? "-scale-x-100" : ""} aria-hidden="true">
      <rect x="10" y="50" width="70" height="80" rx="30" fill={color} />
      <circle cx="25" cy="35" r="16" fill={color} />
      <circle cx="45" cy="25" r="18" fill={color} />
      <circle cx="65" cy="35" r="16" fill={color} />
    </svg>
  );
}

// Pill button whose label slides out to the side on hover while a filled
// version (with an arrow) slides in underneath — same interaction as the
// reference's "InteractiveHoverButton".
function HoverButton({
  children,
  type = "button",
  disabled,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full border border-[#e2e5eb] bg-white px-6 text-sm font-semibold text-[#171a21] shadow-sm transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
        {children}
      </span>
      <span className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-full bg-brand text-brand-foreground opacity-0 transition-all duration-300 group-hover:opacity-100">
        {children}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </span>
    </button>
  );
}

export default function StaffLoginPage() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On success the card shrinks into a corner (as if the two hands gripping
  // its edges were tucking it aside) rather than navigating instantly —
  // router.replace happens after that animation finishes, not before, so
  // it's actually visible rather than skipped by the route change.
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signIn(username, password);
      setRevealing(true);
      setTimeout(() => router.replace("/home"), 700);
    } catch {
      setError(t("error"));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#f5f6f8]">
      <div
        className={`relative flex h-full w-full transition-all duration-700 ease-in ${
          revealing ? "translate-x-[42%] translate-y-[42%] scale-[0.12] opacity-0" : "translate-x-0 translate-y-0 scale-100 opacity-100"
        }`}
        style={{ transformOrigin: "90% 90%" }}
      >
        <div className="pointer-events-none absolute -top-8 -start-8 z-20 rotate-[18deg]">
          <Hand color="#385bc1" />
        </div>
        <div className="pointer-events-none absolute -top-8 -end-8 z-20 -rotate-[18deg]">
          <Hand color="#1f2430" flip />
        </div>

        <div className="relative hidden w-1/2 items-end justify-center overflow-hidden bg-[#eef1f8] md:flex">
          <svg
            className="absolute start-10 top-10 h-7 w-7 text-[#385bc1]/60"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
          </svg>
          <span className="pointer-events-none absolute start-10 top-[18%] select-none text-6xl font-black tracking-tight text-[#385bc1]/[0.08]">
            SAMNAN
          </span>
          <LoginCharacters isTyping={isTyping} showPassword={showPassword} passwordLength={password.length} />
        </div>

        <div className="relative flex w-full flex-col justify-center bg-white px-6 py-12 sm:px-10 md:w-1/2 md:px-16 lg:px-24">
          <div className="absolute top-6 end-6">
            <LanguageSwitcher />
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/samnan-icon.svg" alt={tCommon("appName")} className="h-8 w-8" />
              <span className="text-sm font-semibold text-[#171a21]">{tCommon("appName")}</span>
            </div>

            <h1 className="text-2xl font-bold text-[#171a21]">{t("welcomeBack")}</h1>
            <p className="mt-1 text-sm text-[#6b7280]">{t("enterDetails")}</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-[#171a21]">
                  {t("username")}
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="mt-1 w-full rounded-full border border-[#e2e5eb] bg-white px-4 py-2.5 text-sm text-[#171a21] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#171a21]">
                  {t("password")}
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-full border border-[#e2e5eb] bg-white px-4 py-2.5 pe-10 text-sm text-[#171a21] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-[#374151]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d1d5db] text-brand focus:ring-brand"
                  />
                  {t("rememberMe")}
                </label>
                <Link href="/login/staff/reset-password" className="font-medium text-brand hover:underline">
                  {t("forgotPassword")}
                </Link>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <HoverButton type="submit" disabled={submitting}>
                {submitting ? t("signingIn") : t("submit")}
              </HoverButton>
            </form>

            <p className="mt-6 text-center text-sm text-[#6b7280]">
              {t("noAccount")}{" "}
              <Link href="/login/staff/signup" className="font-medium text-brand hover:underline">
                {t("signUp")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
