import type { ChainConfig } from "@/lib/chains";
import { chainLogo } from "@/lib/wallet/chain-style";
import { cn } from "@/lib/utils";

export function AssetBadge({
  chain,
  size = 48,
  holo = false,
  className,
}: {
  chain: ChainConfig;
  size?: number;
  holo?: boolean;
  className?: string;
}) {
  const logo = chainLogo(chain.id);
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
      aria-label={`${chain.name} logo`}
    >
      <span className="absolute inset-0 rounded-full overflow-hidden bg-black/70 ring-1 ring-white/25">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            decoding="async"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center text-white font-bold"
            style={{
              background: chain.color,
              fontSize: size * 0.42,
              letterSpacing: "-0.02em",
            }}
          >
            {chain.ticker.slice(0, 1)}
          </span>
        )}
        {holo && (
          <>
            <span className="absolute inset-0 holo-shimmer" />
            <span className="absolute inset-0 holo-foil opacity-25 mix-blend-color-dodge" />
          </>
        )}
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/15" />
      </span>
    </span>
  );
}