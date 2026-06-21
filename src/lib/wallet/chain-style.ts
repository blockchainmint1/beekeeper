import type { ChainId, ChainConfig } from "@/lib/chains";
import txcLogo from "@/assets/txc-logo.jpeg";
import iskLogo from "@/assets/isk-logo-badge.png";
import zcuLogo from "@/assets/zcu-logo.png";
import btcLogo from "@/assets/btc-logo.png";

const LOGOS: Partial<Record<ChainId, string>> = {
  btc: btcLogo,
  txc: txcLogo,
  isk: iskLogo,
  zchl: zcuLogo,
};

export function chainLogo(id: ChainId): string | undefined {
  return LOGOS[id];
}

/** Build a 5-stop metallic gradient from a single oklch brand color. */
export function chainGradient(color: string): string {
  const tint = (pct: number, base: string) =>
    `color-mix(in oklab, ${color} ${pct}%, ${base})`;
  return (
    "linear-gradient(135deg, " +
    `${tint(70, "oklch(0.2 0.01 260)")} 0%, ` +
    `${tint(92, "oklch(0.78 0 0)")} 28%, ` +
    `${color} 55%, ` +
    `${tint(78, "oklch(0.18 0.01 260)")} 78%, ` +
    `${tint(62, "oklch(0.14 0.01 260)")} 100%)`
  );
}

export function chainGlowShadow(color: string): string {
  return `0 22px 60px -22px color-mix(in oklab, ${color} 55%, transparent)`;
}

export function chainReflection(color: string): string {
  return (
    `radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, ${color} 22%, transparent), transparent 55%), ` +
    `radial-gradient(120% 80% at 100% 100%, color-mix(in oklab, ${color} 14%, transparent), transparent 60%)`
  );
}

export function chainStyle(chain: ChainConfig) {
  return {
    color: chain.color,
    gradient: chainGradient(chain.color),
    glow: chainGlowShadow(chain.color),
    reflection: chainReflection(chain.color),
    logo: chainLogo(chain.id),
  };
}