#!/usr/bin/env tsx
/**
 * One Wallet to Rule Them All — CLI sender.
 *
 * Reuses the same wallet libs as the browser. Reads either an encrypted JSON
 * backup file or a raw mnemonic from env. Works for all 7 chains.
 *
 * Examples:
 *   tsx scripts/send.ts --chain txc --to txc1qabc... --amount 12.5
 *   tsx scripts/send.ts --chain eth --to 0xabc... --amount 0.05 --token USDC
 *   tsx scripts/send.ts --chain zchl --to 0x... --amount 100 --mnemonic "word word ..."
 *   tsx scripts/send.ts --chain bsc --batch ./recipients.csv
 *
 * Auth:
 *   --vault ./wallet-backup.json --passphrase <pass>
 *   OR  --mnemonic "twelve words ..."
 *   OR  env WALLET_MNEMONIC / WALLET_VAULT / WALLET_PASS
 */
import { readFileSync } from "node:fs";
import { CHAIN_LIST } from "../src/lib/chains";
import { decryptJson, type EncryptedBlob } from "../src/lib/wallet/crypto";
import { deriveUtxoAccount, esplora, coinToSats, buildAndSign, validateUtxoAddress } from "../src/lib/wallet/utxo";
import { deriveEvmAccount, isValidEvmAddress, ethToWei, sendEvm } from "../src/lib/wallet/evm";
import { erc20Transfer } from "../src/lib/wallet/erc20";
import { buildAndSignMultiUtxo, sendEvmMulti } from "../src/lib/wallet/multisend";
import type { Address } from "viem";

function arg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function loadMnemonic(): Promise<string> {
  const direct = arg("mnemonic") ?? process.env.WALLET_MNEMONIC;
  if (direct) return direct.trim();
  const vaultPath = arg("vault") ?? process.env.WALLET_VAULT;
  const pass = arg("passphrase") ?? process.env.WALLET_PASS;
  if (!vaultPath || !pass) throw new Error("Provide --mnemonic OR (--vault and --passphrase)");
  const blob: EncryptedBlob = JSON.parse(readFileSync(vaultPath, "utf8"));
  const { mnemonic } = await decryptJson<{ mnemonic: string }>(blob, pass);
  return mnemonic;
}

function parseCsv(path: string): Array<{ to: string; amount: string }> {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [to, amount] = l.split(/[,\s]+/);
      return { to, amount };
    });
}

async function main() {
  const chainId = arg("chain");
  if (!chainId) throw new Error("--chain required (txc, isk, eth, bsc, base, polygon, zchl)");
  const chain = CHAIN_LIST.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Unknown chain: ${chainId}`);

  const mnemonic = await loadMnemonic();
  const batchFile = arg("batch");
  const tokenSym = arg("token");

  if (batchFile) {
    const rows = parseCsv(batchFile);
    console.log(`Batch sending ${rows.length} recipients on ${chain.name}…`);
    if (chain.kind === "utxo") {
      for (const r of rows) {
        if (!(await validateUtxoAddress(r.to, chain))) throw new Error(`bad addr: ${r.to}`);
      }
      const account = await deriveUtxoAccount(mnemonic, chain, 0, "segwit");
      const { hex } = await buildAndSignMultiUtxo({
        account,
        outputs: rows.map((r) => ({ address: r.to, amountSats: coinToSats(r.amount, chain.decimals) })),
        feeRate: chain.defaultFeeRate,
      });
      const txid = await esplora.broadcast(chain, hex);
      console.log(`✓ broadcast ${txid}`);
      console.log(chain.explorerTx(txid));
    } else {
      const account = deriveEvmAccount(mnemonic, chain, 0);
      const token = tokenSym ? chain.tokens.find((t) => t.symbol === tokenSym) : null;
      if (tokenSym && !token) throw new Error(`Unknown token: ${tokenSym}`);
      await sendEvmMulti({
        account,
        chain,
        token: token ?? null,
        rows: rows.map((r) => ({ to: r.to as Address, amount: r.amount })),
        onProgress: (p) => {
          if (p.status === "sent") console.log(`  [${p.index + 1}/${p.total}] → ${p.to} ✓ ${p.hash}`);
          else if (p.status === "failed") console.log(`  [${p.index + 1}/${p.total}] → ${p.to} ✗ ${p.error}`);
        },
      });
    }
    return;
  }

  const to = arg("to");
  const amount = arg("amount");
  if (!to || !amount) throw new Error("--to and --amount required (or use --batch)");

  if (chain.kind === "utxo") {
    if (!(await validateUtxoAddress(to, chain))) throw new Error("Invalid address");
    const account = await deriveUtxoAccount(mnemonic, chain, 0, "segwit");
    const utxos = (await esplora.addressUtxos(chain, account.address)).filter((u) => u.status.confirmed);
    const { hex } = await buildAndSign({
      account, utxos, toAddress: to,
      amountSats: coinToSats(amount, chain.decimals),
      feeRate: chain.defaultFeeRate,
    });
    const txid = await esplora.broadcast(chain, hex);
    console.log(`✓ ${txid}\n${chain.explorerTx(txid)}`);
  } else {
    if (!isValidEvmAddress(to)) throw new Error("Invalid EVM address");
    const account = deriveEvmAccount(mnemonic, chain, 0);
    let hash: `0x${string}`;
    if (tokenSym) {
      const token = chain.tokens.find((t) => t.symbol === tokenSym);
      if (!token) throw new Error(`Unknown token: ${tokenSym}`);
      hash = await erc20Transfer({ account, token, to: to as Address, amount });
    } else {
      hash = await sendEvm({ account, to: to as Address, amountWei: ethToWei(amount) });
    }
    console.log(`✓ ${hash}\n${chain.explorerTx(hash)}`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});