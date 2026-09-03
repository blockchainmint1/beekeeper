import { scanUtxoHd } from "@/lib/wallet/utxo";
import { CHAINS } from "@/lib/chains";
const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
try {
  const r: any = await scanUtxoHd(M, (CHAINS as any).btc, { count: 3, includeChange: false } as any);
  console.log("btc scan ok", JSON.stringify(r).slice(0, 500));
} catch (e) {
  console.log("btc scan threw:", (e as Error).message.slice(0, 300));
}
