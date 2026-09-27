"use client";

import { useTranslations } from "next-intl";
import ProductShowcase from "@/components/ProductShowcase";

// Samnan's products as live 3D models, the same as on the login page: one
// big one to spin and take apart, the other three in the corner to swap in,
// and the next one coming up by itself every 30 s. Open to everyone signed in.
export default function ProductsPage() {
  const t = useTranslations("products");
  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-sm text-foreground/60">{t("subtitle")}</p>
      <div className="relative mt-6 h-[calc(100vh-13rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <ProductShowcase
          wideOnly={false}
          mainClassName="absolute start-[112px] end-4 top-4 bottom-16 z-10 min-h-[120px] cursor-grab animate-pump-enter"
          takeoverClassName="absolute start-[112px] end-4 top-4 bottom-4 z-30 min-h-[120px] cursor-grab animate-pump-enter"
          stackClassName="absolute start-6 top-6 z-20 flex flex-col gap-3"
          nameFor={(key) => t(`names.${key}`)}
          nameClassName="absolute start-[112px] end-4 bottom-5 text-center text-lg font-semibold text-foreground"
        />
      </div>
    </div>
  );
}
