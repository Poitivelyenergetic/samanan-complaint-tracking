"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginCharacters from "@/components/LoginCharacters";
import { IconEye, IconEyeOff } from "@/components/icons";

// The Samnan Holding Group's subsidiary companies, shown above the
// illustration's characters — mirrors the "Our Companies" section on
// samnan.com.sa (full-color logos, each one a real link to that company's
// page there) rather than leaving that space empty.
const SUBSIDIARY_LOGOS = [
  { src: "/subsidiary-logos/rezeq.webp", alt: "Rezeq", href: "https://samnan.com.sa/en/Company/com2" },
  {
    src: "/subsidiary-logos/sanam-aljazeera.png",
    alt: "Sanam Aljazeera",
    href: "https://samnan.com.sa/en/Company/SANAM%20ALJAZEERA%20COMPANY%20FOR%20PROJECTS%20LTD",
  },
  { src: "/subsidiary-logos/samnan-pools.png", alt: "Samnan Pools", href: "https://samnan.com.sa/en/Company/SMP" },
  {
    src: "/subsidiary-logos/samnan-petroleum.webp",
    alt: "Samnan Petroleum Services",
    href: "https://samnan.com.sa/en/Company/Samnan%20petroleum",
  },
  {
    src: "/subsidiary-logos/water-environment.png",
    alt: "Water & Environment Technology",
    href: "https://samnan.com.sa/en/Company/Miyah%20for%20water%20&%20environment%20technology",
  },
  {
    src: "/subsidiary-logos/alhufi-contracting.png",
    alt: "Alhufi Contracting",
    href: "https://samnan.com.sa/en/Company/ALHUFI%20CONTRACTING%20LIMITED",
  },
  {
    src: "/subsidiary-logos/samnan-real-estate.webp",
    alt: "Samnan Real Estate Investment",
    href: "https://samnan.com.sa/en/Company/SAMNAN%20REAL%20ESTATE%20INVESTMENT",
  },
  {
    src: "/subsidiary-logos/samnan-tech.webp",
    alt: "Samnan Technology Solutions",
    href: "https://samnan.com.sa/en/Company/com11",
  },
];

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
  const locale = useLocale();
  const isRtl = locale === "ar";
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFailedSignal, setLoginFailedSignal] = useState(0);
  // The reveal is three beats, not one:
  //   1. the form's own content clears out — an empty white panel, not a
  //      shrinking one with text still on it.
  //   2. purple reaches out and grabs the (still-resting) divider — his arm
  //      extends from his own shoulder, not from the divider itself, so
  //      it stays visually attached to his body instead of the moving edge.
  //   3. only once he's actually holding it does the pull happen: the
  //      illustration grows to fill the whole screen.
  // All three happen before the actual route change, so the sequence is
  // visible rather than skipped by it.
  const [formCleared, setFormCleared] = useState(false);
  const [reaching, setReaching] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    // Skipped for the whole span of a form-triggered sign-in (submitting
    // stays true from the first line of handleSubmit through to the
    // pull animation's own navigation) — its setTimeout below owns
    // navigation for that flow. Guarding on `revealing` alone isn't enough:
    // the auth context's `user` can flip true (via Firebase's own listener)
    // before this component's setRevealing(true) line even runs, and this
    // effect firing in that gap can't be undone once it does.
    if (!loading && user && !submitting) {
      router.replace("/home");
    }
  }, [loading, user, submitting, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signIn(username, password);
      // Beat 1: the form's own content fades out, leaving a blank white
      // panel rather than shrinking a panel that still has text on it.
      setFormCleared(true);
      setTimeout(() => {
        // Beat 2: purple reaches out and grabs the divider.
        setReaching(true);
        setTimeout(() => {
          // Beat 3: now that he's holding it, the actual pull happens.
          setRevealing(true);
          // Matches the pull's own transition duration below — it needs to
          // actually finish, not just start, before the route swaps to /home.
          setTimeout(() => router.replace("/home"), 1500);
        }, 550);
      }, 350);
    } catch {
      setError(t("error"));
      setSubmitting(false);
      setLoginFailedSignal((n) => n + 1);
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f5f6f8]">
      {/* Login form — full-bleed and static. It doesn't shrink or move; the
          illustration overlay (below, on top of it in z-order) grows to
          cover it, so the reveal reads as purple pulling the scene across
          over the login rather than the login being pushed out of the way. */}
      <div className="relative z-10 flex h-full w-full flex-col justify-center bg-white px-6 py-12 sm:px-10 md:w-1/2 md:ms-[50%] md:px-16 lg:px-24">
        <div className="absolute top-6 end-6">
          <LanguageSwitcher />
        </div>

        {/* Fades out on success before the pull starts — a blank panel
            gets covered, not one that still has the form on it. */}
        <div
          className="mx-auto w-full max-w-sm transition-opacity duration-300 ease-out"
          style={{ opacity: formCleared ? 0 : 1 }}
        >
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

      {/* Illustration overlay — starts covering its own half of the screen
          and grows to cover all of it, on top of the form above. */}
      <div
        className={`login-pull-illustration absolute inset-y-0 start-0 z-20 hidden items-end justify-end overflow-hidden bg-[#eef1f8] pe-6 transition-[width] duration-[1500ms] ease-in-out md:flex ${
          revealing ? "is-revealing" : ""
        }`}
      >
        <div className="absolute top-8 start-10 end-10 flex flex-col items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samnan-icon.svg" alt="Samnan Holding Group" className="h-16 w-16" />
          <div className="grid grid-cols-4 gap-x-6 gap-y-4">
            {SUBSIDIARY_LOGOS.map((logo) => (
              <a
                key={logo.href}
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center transition-transform duration-150 ease-out hover:scale-110"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt={logo.alt} className="h-8 w-auto object-contain" />
              </a>
            ))}
          </div>
        </div>
        <LoginCharacters
          isTyping={isTyping}
          showPassword={showPassword}
          passwordLength={password.length}
          loginFailedSignal={loginFailedSignal}
          reaching={reaching}
          revealing={revealing}
          isRtl={isRtl}
        />
      </div>
    </div>
  );
}
