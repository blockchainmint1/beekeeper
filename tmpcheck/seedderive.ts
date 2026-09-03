import { deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount } from "@/lib/wallet/evm";
import { CHAINS } from "@/lib/chains";
const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const get = (id: string) => (CHAINS as any[]).find((c) => c.id === id);
for (const id of ["txc", "btc", "isk"]) {
  const c = get(id);
  const a = await deriveUtxoAccount(M, c, 0, c.defaultAddressType);
  console.log(id, JSON.stringify(a).slice(0, 260));
}
console.log("eth", JSON.stringify(deriveEvmAccount(M, get("eth"), 0)).slice(0, 200));
