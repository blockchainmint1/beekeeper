import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChainConfig } from "@/lib/chains";
import { deriveUtxoAccount, type UtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount, type EvmAccount } from "@/lib/wallet/evm";
import { deriveTronAccount, type TronAccount } from "@/lib/wallet/tron";
import { deriveSolanaAccount, type SolanaAccount } from "@/lib/wallet/solana";

export type AccountUnion =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount }
  | { kind: "tron"; account: TronAccount }
  | { kind: "solana"; account: SolanaAccount };

interface WalletSession {
  mnemonic: string;
  lock: () => void;
}

const WalletSessionContext = createContext<WalletSession | null>(null);

export const WalletSessionProvider = WalletSessionContext.Provider;

/** Unlocked-wallet session. Only valid inside the /wallet layout. */
export function useWalletSession(): WalletSession {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) throw new Error("useWalletSession must be used inside the wallet layout");
  return ctx;
}

/** Derive (and cache) the index-0 account for one chain. */
export function useChainAccount(chain: ChainConfig | undefined) {
  const { mnemonic } = useWalletSession();
  return useQuery({
    queryKey: ["account", chain?.id],
    enabled: !!chain && !!mnemonic,
    staleTime: Infinity,
    queryFn: async (): Promise<AccountUnion> => {
      const c = chain!;
      if (c.kind === "utxo") {
        return { kind: "utxo", account: await deriveUtxoAccount(mnemonic, c, 0, c.defaultAddressType) };
      }
      if (c.kind === "evm") return { kind: "evm", account: deriveEvmAccount(mnemonic, c, 0) };
      if (c.kind === "tron") return { kind: "tron", account: deriveTronAccount(mnemonic, c, 0) };
      return { kind: "solana", account: deriveSolanaAccount(mnemonic, c, 0) };
    },
  });
}
