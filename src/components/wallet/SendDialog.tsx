import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, ExternalLink } from "lucide-react";
import type { ChainConfig } from "@/lib/chains";
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
import type { Address } from "viem";

type Account =
  | { kind: "utxo"; account: UtxoAccount }
  | { kind: "evm"; account: EvmAccount };

export function SendDialog({
  open,
  onOpenChange,
  chain,
  account,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
  account: Account;
  onSent?: () => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);

  function reset() {
    setTo("");
    setAmount("");
    setTxid(null);
  }

  async function handleSend() {
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
        toast.success("Transaction broadcast");
      } else if (chain.kind === "evm" && account.kind === "evm") {
        const toAddr = to.trim() as Address;
        if (!isValidEvmAddress(toAddr)) throw new Error("Not a valid EVM address");
        const wei = ethToWei(amount);
        const bal = await evmBalance(chain, account.account.address);
        if (bal < wei) throw new Error(`Balance ${weiToEth(bal)} too low`);
        const hash = await sendEvm({ account: account.account, to: toAddr, amountWei: wei });
        setTxid(hash);
        toast.success("Transaction sent");
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {chain.ticker}</DialogTitle>
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
            <div>
              <Label htmlFor="to" className="mb-1.5 block text-xs">Recipient address</Label>
              <Input
                id="to"
                placeholder={chain.kind === "evm" ? "0x…" : `${chain.ticker.toLowerCase()}1…`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="amt" className="mb-1.5 block text-xs">Amount ({chain.ticker})</Label>
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
            </div>
          </div>
        )}

        <DialogFooter>
          {txid ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : (
            <Button onClick={handleSend} disabled={busy || !to || !amount}>
              <Send className="mr-2 h-4 w-4" /> {busy ? "Sending…" : "Send"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}