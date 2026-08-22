import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getChain, type ChainId } from "@/lib/chains";
import { useChainAccount } from "@/components/wallet/session";
import {
  HANDOFF_DISCLAIMERS,
  ORDER_MAX_USD,
  ORDER_MIN_USD,
  SUGGESTED_USD,
  TRADE_DESK_URL,
  assetsFor,
  formatUsd,
  quoteOrder,
  saveHandoffOrder,
  type OrderSide,
} from "@/lib/handoff/orders";
import { startHandoffOrder } from "@/lib/handoff/orders.functions";

type Step = "intro" | "amount" | "details" | "review" | "handoff";

interface Props {
  side: OrderSide;
}

export function HandoffWizard({ side }: Props) {
  const buy = side === "buy";
  const assets = assetsFor(side);
  const [step, setStep] = useState<Step>("intro");
  const [chain, setChain] = useState<ChainId>(assets[0]!.chain);
  const [usdText, setUsdText] = useState("100");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    orderId: string;
    handoffUrl: string | null;
    registered: boolean;
    detail: string;
    feeUsd: number;
  } | null>(null);

  const start = useServerFn(startHandoffOrder);
  const account = useChainAccount(getChain(chain));
  const asset = assets.find((a) => a.chain === chain) ?? assets[0]!;
  const usd = Number(usdText) || 0;
  const quote = useMemo(() => quoteOrder(side, usd), [side, usd]);
  const amountValid = usd >= ORDER_MIN_USD && usd <= ORDER_MAX_USD;
  const contactValid = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const allAccepted = HANDOFF_DISCLAIMERS.every((d) => accepted[d.id]);

  async function place() {
    setSubmitting(true);
    try {
      const res = await start({
        data: {
          side,
          usd,
          asset: asset.ticker,
          chain,
          address: buy ? (account.data?.account.address ?? null) : null,
          name: name.trim(),
          email: email.trim(),
          acceptedDisclaimers: HANDOFF_DISCLAIMERS.map((d) => d.id),
        },
      });
      setResult(res);
      saveHandoffOrder({
        id: res.orderId,
        createdAt: Date.now(),
        side,
        status: res.registered ? "handed_off" : "pending",
        usd,
        feeUsd: res.feeUsd,
        settlementUsd: quote.settlementUsd,
        asset: asset.ticker,
        chain,
        address: buy ? (account.data?.account.address ?? null) : null,
        email: email.trim(),
        name: name.trim(),
        handoffUrl: res.handoffUrl,
        registered: res.registered,
      });
      if (!res.registered) toast.error(res.detail);
      setStep("handoff");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {step === "intro" && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Banknote className="h-4 w-4 text-primary" />
            {buy ? "Add dollars, get crypto" : "Sell crypto, get dollars"}
          </div>
          <p className="text-sm text-muted-foreground">
            {buy
              ? "You start the order here, then finish on VectorPay — our licensed partner handles identity, bank linking and payment. Crypto is delivered straight to your self-custodied Beekeeper address."
              : "You start the order here, then finish on VectorPay — our licensed partner handles identity, bank linking and the payout. You send crypto from your own wallet when they tell you where."}
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Beekeeper never holds your
              crypto or your bank credentials.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Service fee is 1% of the
              order. Bank settlement takes 1–3 business days.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Self-serve limit is{" "}
              {formatUsd(ORDER_MAX_USD)} per order —{" "}
              <a className="underline" href={TRADE_DESK_URL} target="_blank" rel="noreferrer">
                trade desk
              </a>{" "}
              for larger tickets.
            </li>
          </ul>
          <Button className="w-full" onClick={() => setStep("amount")}>
            Get started <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Card>
      )}

      {step === "amount" && (
        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">{buy ? "How much?" : "How much do you want out?"}</div>
          <div className="grid grid-cols-4 gap-2">
            {SUGGESTED_USD.map((v) => (
              <Button
                key={v}
                variant={usd === v ? "default" : "outline"}
                size="sm"
                onClick={() => setUsdText(String(v))}
              >
                ${v}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="handoff-usd">
              Amount in USD
            </label>
            <Input
              id="handoff-usd"
              inputMode="decimal"
              value={usdText}
              onChange={(e) => setUsdText(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            {!amountValid && usdText !== "" && (
              <p className="text-xs text-destructive">
                Enter between {formatUsd(ORDER_MIN_USD)} and {formatUsd(ORDER_MAX_USD)}.
              </p>
            )}
          </div>

          <Separator />
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{buy ? "Deliver as" : "Sell"}</div>
            {assets.map((a) => (
              <button
                key={a.chain}
                type="button"
                onClick={() => setChain(a.chain)}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm ${
                  chain === a.chain ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span>{a.label}</span>
                <span className="text-xs text-muted-foreground">{getChain(a.chain).name}</span>
              </button>
            ))}
          </div>

          <Separator />
          <Row label={buy ? "Order" : "You sell"} value={formatUsd(quote.usd)} />
          <Row label="Service fee (1%)" value={formatUsd(quote.feeUsd)} />
          <Row
            label={buy ? "Total from your bank" : "Estimated to your bank"}
            value={formatUsd(quote.settlementUsd)}
            strong
          />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("intro")}>
              Back
            </Button>
            <Button className="flex-1" disabled={!amountValid} onClick={() => setStep("details")}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "details" && (
        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">Who is this order for?</div>
          <p className="text-xs text-muted-foreground">
            VectorPay uses this to match your order when you verify your identity and link your bank.
          </p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="handoff-name">
              Full legal name
            </label>
            <Input id="handoff-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="handoff-email">
              Email
            </label>
            <Input
              id="handoff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {buy && (
            <Row
              label="Delivered to"
              value={account.data?.account.address ?? "Deriving…"}
              mono
            />
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("amount")}>
              Back
            </Button>
            <Button className="flex-1" disabled={!contactValid} onClick={() => setStep("review")}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">Before you go to VectorPay</div>
          <div className="space-y-3">
            {HANDOFF_DISCLAIMERS.map((d) => (
              <label key={d.id} className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
                <Checkbox
                  checked={Boolean(accepted[d.id])}
                  onCheckedChange={(v) => setAccepted((p) => ({ ...p, [d.id]: Boolean(v) }))}
                />
                <span>{d.text}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            See the{" "}
            <Link to="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
          <Separator />
          <Row label={buy ? "Order" : "You sell"} value={formatUsd(quote.usd)} />
          <Row label={buy ? "Receive" : "Send"} value={`${asset.ticker} · ${getChain(chain).name}`} />
          <Row
            label={buy ? "Total from your bank" : "Estimated to your bank"}
            value={formatUsd(quote.settlementUsd)}
            strong
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("details")}>
              Back
            </Button>
            <Button className="flex-1" disabled={!allAccepted || submitting} onClick={place}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Place order
            </Button>
          </div>
        </Card>
      )}

      {step === "handoff" && result && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Order {result.orderId} started
          </div>
          <p className="text-sm text-muted-foreground">
            {result.registered
              ? "VectorPay has your order. Finish there to verify your identity, link your bank and pay."
              : `We couldn't reach VectorPay to register this order: ${result.detail} Keep the reference and contact support.`}
          </p>
          <Row label="Reference" value={result.orderId} mono />
          <Row label={buy ? "Order" : "You sell"} value={formatUsd(quote.usd)} />
          <Row label="Service fee (1%)" value={formatUsd(result.feeUsd)} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                void navigator.clipboard.writeText(result.orderId);
                toast.success("Reference copied");
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copy reference
            </Button>
            {result.handoffUrl ? (
              <Button className="flex-1" asChild>
                <a href={result.handoffUrl} target="_blank" rel="noreferrer">
                  Continue at VectorPay <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button className="flex-1" disabled>
                Checkout link pending
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right ${mono ? "break-all font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
