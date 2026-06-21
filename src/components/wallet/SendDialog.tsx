import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, ExternalLink, BookUser } from "lucide-react";
import type { ChainConfig, EvmChain, Erc20Token } from "@/lib/chains";
import {
  validateUtxoAddress,
  esplora,
  buildAndSign,
  coinToSats,
  satsToCoin,
  type UtxoAccount,
} from "@/lib/wallet/utxo";
import {
  isValidEvmAddress,
  evmBalance,
  ethToWei,
  sendEvm,
  weiToEth,
  type EvmAccount,
} from "@/lib/wallet/evm";
import { erc20Balance, erc20Transfer, formatToken } from "@/lib/wallet/erc20";
import {
  isValidTronAddress,
  tronBalance,
  sendTron,
  sunToTrx,
  trxToSun,
  type TronAccount,
} from "@/lib/wallet/tron";
import {
  isValidSolanaAddress,
  solanaBalance,
  sendSolana,
  lamportsToSol,
  solToLamports,
  type SolanaAccount,
} from "@/lib/wallet/solana";
import { useContacts } from "@/lib/wallet/contacts";
import { useSecurityPrefs, isKnownAddress, rememberAddress } from "@/lib/wallet/security";
import type { Address } from "viem";

type Account =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount }
  | { kind: "tron"; account: TronAccount }
  | { kind: "solana"; account: SolanaAccount };

export function SendDialog({
  open,
  onOpenChange,
  chain,
  account,
  onSent,
  initialTo,
  initialTokenSymbol,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
  account: Account;
  onSent?: () => void;
  initialTo?: string;
  initialTokenSymbol?: string;
}) {
  const [to, setTo] = useState(initialTo ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);
  // EVM-only: which asset to send — "native" or one of chain.tokens
  const evmChain = chain.kind === "evm" ? (chain as EvmChain) : null;
  const [asset, setAsset] = useState<string>(initialTokenSymbol ?? "native");
  const token: Erc20Token | null =
    evmChain && asset !== "native" ? (evmChain.tokens.find((t) => t.symbol === asset) ?? null) : null;

  const contacts = useContacts(chain.id);
  const securityPrefs = useSecurityPrefs();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const ownAddress = account.account.address;

  const ticker = token?.symbol ?? chain.ticker;

  function reset() {
    setTo(initialTo ?? "");
    setAmount("");
    setTxid(null);
    setAsset(initialTokenSymbol ?? "native");
  }

  async function handleMax() {
    try {
      if (chain.kind === "utxo" && account.kind === "utxo") {
        const utxos = await esplora.addressUtxos(chain, account.account.address);
        const confirmed = utxos.filter((u) => u.status.confirmed);
        const totalSats = confirmed.reduce((s, u) => s + u.value, 0);
        // crude fee estimate: 11 + 68*nIn + 34*2
        const est = 11 + 68 * confirmed.length + 34 * 2;
        const fee = Math.max(est * chain.defaultFeeRate, 250);
        const max = Math.max(0, totalSats - fee);
        setAmount(satsToCoin(max, chain.decimals));
      } else if (evmChain && account.kind === "evm") {
        if (token) {
          const raw = await erc20Balance(evmChain, token, account.account.address);
          setAmount(formatToken(raw, token.decimals, token.decimals));
        } else {
          const wei = await evmBalance(evmChain, account.account.address);
          // Reserve ~0.0005 native for gas
          const reserve = 5n * 10n ** 14n;
          const spendable = wei > reserve ? wei - reserve : 0n;
          setAmount(weiToEth(spendable));
        }
      } else if (chain.kind === "tron" && account.kind === "tron") {
        const sun = await tronBalance(chain, account.account.address);
        // Reserve 1 TRX for activation/bandwidth.
        const reserve = 1_000_000n;
        const spendable = sun > reserve ? sun - reserve : 0n;
        setAmount(sunToTrx(spendable));
      } else if (chain.kind === "solana" && account.kind === "solana") {
        const lam = await solanaBalance(chain, account.account.address);
        // Reserve ~0.001 SOL for rent + fees.
        const reserve = 1_000_000n;
        const spendable = lam > reserve ? lam - reserve : 0n;
        setAmount(lamportsToSol(spendable));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't compute max");
    }
  }

  async function handleSend() {
    // First-send-to-new-address guard
    const inContacts = contacts.some((c) => c.address.toLowerCase() === to.trim().toLowerCase());
    if (
      securityPrefs.firstSendWarning &&
      !pendingConfirmation &&
      !inContacts &&
      !isKnownAddress(to.trim())
    ) {
      setPendingConfirmation(true);
      return;
    }
    setPendingConfirmation(false);
    setBusy(true);
    try {
      if (chain.kind === "utxo" && account.kind === "utxo") {
        const valid = await validateUtxoAddress(to.trim(), chain);
        if (!valid) throw new Error(`Not a valid ${chain.ticker} address`);
        const amountSats = coinToSats(amount, chain.decimals);
        const utxos = await esplora.addressUtxos(chain, account.account.address);
        const confirmed = utxos.filter((u) => u.status.confirmed);
        if (confirmed.length === 0) throw new Error("No confirmed UTXOs to spend");
        const { hex } = await buildAndSign({
          account: account.account,
          utxos: confirmed,
          toAddress: to.trim(),
          amountSats,
          feeRate: chain.defaultFeeRate,
        });
        const id = await esplora.broadcast(chain, hex);
        setTxid(id);
        rememberAddress(to.trim());
        toast.success("Transaction broadcast");
      } else if (evmChain && account.kind === "evm") {
        const toAddr = to.trim() as Address;
        if (!isValidEvmAddress(toAddr)) throw new Error("Not a valid EVM address");
        if (token) {
          const hash = await erc20Transfer({ account: account.account, token, to: toAddr, amount });
          setTxid(hash);
          rememberAddress(toAddr);
          toast.success(`${token.symbol} transfer sent`);
        } else {
          const wei = ethToWei(amount);
          const bal = await evmBalance(evmChain, account.account.address);
          if (bal < wei) throw new Error(`Balance ${weiToEth(bal)} too low`);
          const hash = await sendEvm({ account: account.account, to: toAddr, amountWei: wei });
          setTxid(hash);
          rememberAddress(toAddr);
          toast.success("Transaction sent");
        }
      } else if (chain.kind === "tron" && account.kind === "tron") {
        if (!isValidTronAddress(to.trim())) throw new Error("Not a valid TRON address");
        const amountSun = trxToSun(amount);
        const hash = await sendTron({ account: account.account, to: to.trim(), amountSun });
        setTxid(hash);
        rememberAddress(to.trim());
        toast.success("TRX sent");
      } else if (chain.kind === "solana" && account.kind === "solana") {
        if (!isValidSolanaAddress(to.trim())) throw new Error("Not a valid Solana address");
        const amountLamports = solToLamports(amount);
        const hash = await sendSolana({ account: account.account, to: to.trim(), amountLamports });
        setTxid(hash);
        rememberAddress(to.trim());
        toast.success("SOL sent");
      }
      onSent?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  const filteredContacts = useMemo(
    () => contacts.filter((c) => c.address !== ownAddress),
    [contacts, ownAddress],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {ticker} ({chain.name})</DialogTitle>
          <DialogDescription>
            Double-check the destination address — transactions cannot be reversed.
          </DialogDescription>
        </DialogHeader>

        {txid ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Transaction broadcast.</p>
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
              {txid}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(chain.explorerTx(txid), "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> View on explorer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {evmChain && evmChain.tokens.length > 0 && (
              <div>
                <Label className="mb-1.5 block text-xs">Asset</Label>
                <Select value={asset} onValueChange={setAsset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="native">{evmChain.nativeSymbol} (native)</SelectItem>
                    {evmChain.tokens.map((t) => (
                      <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="to" className="mb-1.5 block text-xs">Recipient address</Label>
              <Input
                id="to"
                placeholder={
                  chain.kind === "evm"
                    ? "0x…"
                    : chain.kind === "tron"
                      ? "T…"
                      : chain.kind === "solana"
                        ? "base58 pubkey…"
                        : `${chain.ticker.toLowerCase()}1…`
                }
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="font-mono text-sm"
              />
              {filteredContacts.length > 0 && (
                <div className="mt-1.5">
                  <Select value="" onValueChange={(v) => setTo(v)}>
                    <SelectTrigger className="h-8">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BookUser className="h-3.5 w-3.5" /> Pick from contacts
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {filteredContacts.map((c) => (
                        <SelectItem key={c.id} value={c.address}>
                          {c.label} · <span className="font-mono text-[10px]">{c.address.slice(0, 10)}…{c.address.slice(-6)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="amt" className="text-xs">Amount ({ticker})</Label>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleMax}>MAX</Button>
              </div>
              <Input
                id="amt"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              {chain.kind === "utxo" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Network fee: ~{satsToCoin(chain.defaultFeeRate * 250, chain.decimals)} {chain.ticker}
                </p>
              )}
              {evmChain && !token && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Gas paid in {evmChain.nativeSymbol}. MAX reserves a small amount for fees.
                </p>
              )}
            </div>
          </div>
        )}

        {pendingConfirmation && !txid && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-medium text-amber-200">⚠ First time sending to this address</p>
            <p className="mt-1">
              You've never sent to <span className="font-mono">{to.slice(0, 12)}…{to.slice(-8)}</span> from this wallet before.
              Double-check it character-by-character against the source — clipboard malware can swap addresses.
              Click "Send" again to confirm.
            </p>
          </div>
        )}

        <DialogFooter>
          {txid ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : (
            <Button onClick={handleSend} disabled={busy || !to || !amount} variant={pendingConfirmation ? "destructive" : "default"}>
              <Send className="mr-2 h-4 w-4" /> {busy ? "Sending…" : pendingConfirmation ? `Confirm send ${ticker}` : `Send ${ticker}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}