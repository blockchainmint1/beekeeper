import { deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount } from "@/lib/wallet/evm";
import { CHAINS } from "@/lib/chains";
const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const M2 = "legal winner thank year wave sausage worth useful legal winner thank yellow";
for (const m of [M, M2]) {
  for (const id of ["txc", "btc", "isk"]) {
    const c = (CHAINS as any)[id];
    const a: any = await deriveUtxoAccount(m, c, 0, c.defaultAddressType);
    console.log(m.slice(0, 12), id, a.address, a.path ?? a.derivationPath ?? "");
  }
  const e: any = deriveEvmAccount(m, (CHAINS as any).eth, 0);
  console.log(m.slice(0, 12), "eth", e.address);
}
