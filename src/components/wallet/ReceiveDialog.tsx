import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import type { ChainConfig, UtxoChain } from "@/lib/chains";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOmniTokens, buildOmniPaymentUri } from "@/lib/wallet/omni-tokens";

export function ReceiveDialog({
  open,
  onOpenChange,
  chain,
  address,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chain: ChainConfig;
  address: string;
}) {
  const [qr, setQr] = useState<string>("");

  // Omni-capable chains (TXC family) can request a token like TSD on the same
  // legacy address — the QR carries the property id and amount.
  const omniChain: UtxoChain | null =
    chain.kind === "utxo" && chain.supportsOmni ? (chain as UtxoChain) : null;
  const { tokens: omniTokens } = useOmniTokens((omniChain ?? chain) as UtxoChain);
  const [asset, setAsset] = useState("native");
  const [amount, setAmount] = useState("");
  const omniToken = omniChain
    ? (omniTokens.find((t) => asset === `omni:${t.id}`) ?? null)
    : null;

  const payload = omniToken
    ? buildOmniPaymentUri(omniChain!, address, omniToken.id, amount)
    : address;

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(payload, { margin: 1, width: 260 }).then(setQr).catch(() => setQr(""));
  }, [address, payload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive {chain.ticker}</DialogTitle>
          <DialogDescription>
            Share this address to receive {chain.name}. Only send {chain.ticker} to this address.
          </DialogDescription>
        </DialogHeader>
        {omniChain && omniTokens.length > 0 && (
          <div className="space-y-2">
            <div>
              <Label className="mb-1.5 block text-xs">Asset</Label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">{omniChain.ticker} (native)</SelectItem>
                  {omniTokens.map((t) => (
                    <SelectItem key={t.id} value={`omni:${t.id}`}>
                      {t.symbol} — {t.name ?? `Property #${t.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {omniToken && (
              <div>
                <Label htmlFor="req-amt" className="mb-1.5 block text-xs">
                  Request amount ({omniToken.symbol}) — optional
                </Label>
                <Input
                  id="req-amt"
                  placeholder="0.0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  This same address receives {omniChain.ticker} and its Omni tokens such as{" "}
                  {omniToken.symbol}.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          {qr ? (
            <img src={qr} alt={`${chain.ticker} address QR`} className="w-full max-w-[260px] rounded-lg border bg-white p-2" />
          ) : (
            <div className="aspect-square w-full max-w-[260px] animate-pulse rounded-lg bg-muted" />
          )}
          <div className="w-full rounded-md border bg-muted/40 p-3 font-mono text-xs break-all text-center">
            {address}
          </div>
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(omniToken ? payload : address);
                toast.success(omniToken ? "Payment request copied" : "Address copied");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.open(chain.explorerAddr(address), "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Explorer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}