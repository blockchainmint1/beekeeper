import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, PenLine, ShieldCheck } from "lucide-react";
import { CHAIN_LIST, type ChainConfig } from "@/lib/chains";
import { getCachedMnemonic } from "@/lib/wallet/seed";
import {
  evmSignMessage,
  evmVerifyMessage,
  utxoSignMessage,
  utxoVerifyMessage,
} from "@/lib/wallet/signing";
import { deriveUtxoAccount } from "@/lib/wallet/utxo";
import { deriveEvmAccount } from "@/lib/wallet/evm";

export function SignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign & verify messages</DialogTitle>
          <DialogDescription>
            Prove address ownership without sending a transaction.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="sign">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign"><PenLine className="mr-1.5 h-4 w-4" /> Sign</TabsTrigger>
            <TabsTrigger value="verify"><ShieldCheck className="mr-1.5 h-4 w-4" /> Verify</TabsTrigger>
          </TabsList>
          <TabsContent value="sign" className="pt-4"><SignTab /></TabsContent>
          <TabsContent value="verify" className="pt-4"><VerifyTab /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SignTab() {
  const mnemonic = useMemo(() => getCachedMnemonic() ?? "", []);
  const [chainId, setChainId] = useState<string>(CHAIN_LIST[0].id);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ address: string; signature: string } | null>(null);

  const chain = CHAIN_LIST.find((c) => c.id === chainId)!;

  async function handleSign() {
    if (!mnemonic) { toast.error("Wallet locked"); return; }
    if (!message.trim()) { toast.error("Message required"); return; }
    setBusy(true);
    setResult(null);
    try {
      if (chain.kind === "evm") {
        const { address, signature } = await evmSignMessage({ mnemonic, chain, message });
        setResult({ address, signature });
      } else {
        const account = await deriveUtxoAccount(mnemonic, chain, 0, "segwit");
        const signature = await utxoSignMessage({ mnemonic, chain, message, type: "segwit" });
        setResult({ address: account.address, signature });
      }
      toast.success("Message signed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1.5 block text-xs">Chain</Label>
        <Select value={chainId} onValueChange={setChainId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHAIN_LIST.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.ticker})</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">Message</Label>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hello, I am proving I own this address…" />
      </div>
      <Button onClick={handleSign} disabled={busy || !message} className="w-full">
        {busy ? "Signing…" : "Sign message"}
      </Button>
      {result && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider">Address</Label>
            <p className="break-all font-mono text-xs">{result.address}</p>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider">Signature</Label>
            <p className="break-all font-mono text-xs">{result.signature}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              const payload = JSON.stringify({ chain: chain.id, address: result.address, message, signature: result.signature }, null, 2);
              navigator.clipboard.writeText(payload);
              toast.success("Signed payload copied");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copy signed payload
          </Button>
        </div>
      )}
    </div>
  );
}

function VerifyTab() {
  const [chainId, setChainId] = useState<string>(CHAIN_LIST[0].id);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [valid, setValid] = useState<null | boolean>(null);

  const chain = CHAIN_LIST.find((c) => c.id === chainId)!;

  async function handleVerify() {
    setBusy(true);
    setValid(null);
    try {
      let ok = false;
      if (chain.kind === "evm") {
        ok = await evmVerifyMessage({
          message,
          signature: signature.trim() as `0x${string}`,
          expectedAddress: address.trim(),
        });
      } else {
        ok = await utxoVerifyMessage({ chain, message, address: address.trim(), signatureBase64: signature.trim() });
      }
      setValid(ok);
    } catch {
      setValid(false);
    } finally {
      setBusy(false);
    }
  }

  function pasteJson() {
    navigator.clipboard.readText().then((text) => {
      try {
        const obj = JSON.parse(text);
        if (obj.chain) setChainId(obj.chain);
        if (obj.address) setAddress(obj.address);
        if (obj.message) setMessage(obj.message);
        if (obj.signature) setSignature(obj.signature);
        toast.success("Payload loaded");
      } catch {
        toast.error("Clipboard does not contain a signed payload");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="mb-1.5 block text-xs">Chain</Label>
          <Select value={chainId} onValueChange={setChainId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHAIN_LIST.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="self-end" onClick={pasteJson}>Paste JSON</Button>
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">Address</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} className="font-mono text-xs" />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">Message</Label>
        <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">Signature</Label>
        <Textarea rows={2} value={signature} onChange={(e) => setSignature(e.target.value)} className="font-mono text-xs" />
      </div>
      <Button onClick={handleVerify} disabled={busy || !address || !message || !signature} className="w-full">
        {busy ? "Verifying…" : "Verify"}
      </Button>
      {valid !== null && (
        <div className={`rounded-md border p-3 text-sm ${valid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
          {valid ? "✓ Valid signature for this address." : "✗ Signature does NOT match this address."}
        </div>
      )}
    </div>
  );
}