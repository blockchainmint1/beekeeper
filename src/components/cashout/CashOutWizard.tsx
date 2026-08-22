import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getChain, type ChainId } from "@/lib/chains";
import { useChainAccount, useWalletSession } from "@/components/wallet/session";
import { usePortfolioTotal, useChainPrice } from "@/lib/wallet/portfolio";
import {
  CASHOUT_ASSETS,
  CASHOUT_DISCLAIMERS,
  CASHOUT_FIRST_ORDER_MAX_USD,
  CASHOUT_MAX_USD,
  CASHOUT_MIN_USD,
  TRADE_DESK_URL,
  formatUsd,
  quoteCashOut,
} from "@/lib/payout/cashout";
import { openPlaidLink } from "@/lib/topup/plaid-link";
import { createTopUpLinkToken } from "@/lib/topup/plaid.functions";
import {
  reportCashOutTx,
  submitCashOutOrder,
  verifyPayoutBankFn,
} from "@/lib/payout/cashout.functions";
import { hasCompletedCashOut, saveCashOutOrder } from "@/lib/payout/orders";
import type { BankSummary, CashOutOrderRecord } from "@/lib/payout/types";
import { getVaultFingerprint } from "@/lib/wallet/seed";

type Step = "intro" | "amount" | "bank" | "confirm" | "disclaimers" | "transfer" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "intro", label: "Funds" },
  { id: "amount", label: "Amount" },
  { id: "bank", label: "Bank" },
  { id: "confirm", label: "Confirm" },
  { id: "disclaimers", label: "Authorize" },
  { id: "transfer", label: "Send" },
];

export function CashOutWizard({ available, chains }: { available: boolean; chains: string[] }) {
  const { mnemonic } = useWalletSession();
  const [step, setStep] = useState<Step>("intro");
  const [asset, setAsset] = useState<ChainId>((chains[0] as ChainId) ?? "txc");
  const [usd, setUsd] = useState<number>(100);
  const [bank, setBank] = useState<BankSummary | null>(null);
  const [linking, setLinking] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<CashOutOrderRecord | null>(null);
  const [txid, setTxid] = useState("");
  const [reporting, setReporting] = useState(false);

  const chain = getChain(asset);
  const account = useChainAccount(chain);
  const price = useChainPrice(chain);
  const total = usePortfolioTotal(mnemonic);

  const quote = useMemo(() => quoteCashOut(usd), [usd]);
  const isFirstOrder = useMemo(() => !hasCompletedCashOut(), []);
  const cap = isFirstOrder ? CASHOUT_FIRST_ORDER_MAX_USD : CASHOUT_MAX_USD;
  const allAccepted = CASHOUT_DISCLAIMERS.every((d) => accepted[d.id]);

  const cryptoAmount = price && price > 0 ? (usd / price).toFixed(8) : "";
  const assetOptions = CASHOUT_ASSETS.filter((a) => chains.length === 0 || chains.includes(a.chain));

  async function linkBank() {
    setLinking(true);
    try {
      const clientUserId = getVaultFingerprint() || "beekeeper-guest";
      const { linkToken } = await createTopUpLinkToken({
        data: {
          clientUserId,
          redirectUri:
            typeof window !== "undefined" && window.location.protocol === "https:"
              ? `${window.location.origin}/wallet/cashout`
              : undefined,
        },
      });
      const outcome = await openPlaidLink(linkToken);
      const summary = await verifyPayoutBankFn({
        data: { publicToken: outcome.publicToken, accountId: outcome.accountId },
      });
      setBank(summary);
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link that bank account.");
    } finally {
      setLinking(false);
    }
  }

  async function placeOrder() {
    if (!bank || !account.data || !cryptoAmount) return;
    setPlacing(true);
    try {
      const rec = await submitCashOutOrder({
        data: {
          sealedRef: bank.sealedRef,
          chainId: chain.id,
          asset: chain.ticker,
          cryptoAmount,
          grossUsd: usd,
          acceptedDisclaimers: CASHOUT_DISCLAIMERS.filter((d) => accepted[d.id]).map((d) => d.id),
          refundAddress: account.data.account.address,
          isFirstOrder,
        },
      });
      saveCashOutOrder(rec);
      setOrder(rec);
      setStep("transfer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't open that cash-out.");
    } finally {
      setPlacing(false);
    }
  }

  async function reportTransfer() {
    if (!order || txid.trim().length < 6) return;
    setReporting(true);
    try {
      await reportCashOutTx({ data: { treasuryRef: order.treasuryRef, txid: txid.trim() } });
      const updated: CashOutOrderRecord = {
        ...order,
        status: "transfer_reported",
        txid: txid.trim(),
        txReportedAt: Date.now(),
      };
      saveCashOutOrder(updated);
      setOrder(updated);
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that transfer.");
    } finally {
      setReporting(false);
    }
  }

  if (!available) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-amber-500" /> Cash-outs aren't switched on yet
        </div>
        <p className="text-sm text-muted-foreground">
          Selling back to dollars needs our settlement partner live plus a funded settlement address.
          Until then, the trade desk will buy your coins over the counter.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={TRADE_DESK_URL} target="_blank" rel="noreferrer">
            Contact the trade desk
          </a>
        </Button>
      </Card>
    );
  }

  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === step));

  return (
    <div className="space-y-5">
      {step !== "done" && (
        <ol className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`flex-1 rounded-full px-2 py-1 text-center ${
                i <= stepIndex ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {step === "intro" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Cash out to your bank</h2>
          <div className="rounded-2xl border p-4 text-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Your funds right now
            </div>
            <div className="mt-1 text-3xl font-semibold tabular">
              {total.isPending ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                formatUsd(total.data ?? 0)
              )}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Across every address this wallet controls
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              "Link a US checking or savings account — the same Plaid check we use for buying.",
              "Send the crypto from this wallet to the settlement address we issue you.",
              "Once it confirms on-chain, we send dollars by ACH in 1–3 business days.",
              "Self-serve cash-outs top out at " + formatUsd(CASHOUT_MAX_USD) + " per order.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={() => setStep("amount")}>
            Get started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      )}

      {step === "amount" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">How much do you want out?</h2>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sell from</label>
            <div className="flex flex-wrap gap-2">
              {assetOptions.map((a) => (
                <button
                  key={a.chain}
                  onClick={() => setAsset(a.chain)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    asset === a.chain ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
            <Input
              inputMode="decimal"
              placeholder={`${CASHOUT_MIN_USD} – ${cap}`}
              value={usd ? String(usd) : ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setUsd(Number.isFinite(n) ? n : 0);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {price
                ? `≈ ${cryptoAmount} ${chain.ticker} at ${formatUsd(price)} / ${chain.ticker}`
                : "Loading price…"}
            </p>
          </div>

          <Separator />
          <QuoteRows quote={quote} />

          {isFirstOrder && (
            <p className="text-[11px] text-muted-foreground">
              Your first cash-out is capped at {formatUsd(CASHOUT_FIRST_ORDER_MAX_USD)} until one payout
              settles. After that your limit rises to {formatUsd(CASHOUT_MAX_USD)}.
            </p>
          )}
          {usd > cap && (
            <p className="text-[11px] text-destructive">
              Over your current limit —{" "}
              <a className="underline" href={TRADE_DESK_URL} target="_blank" rel="noreferrer">
                talk to the trade desk
              </a>{" "}
              for larger sales.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("intro")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!(usd >= CASHOUT_MIN_USD && usd <= cap) || !cryptoAmount}
              onClick={() => setStep("bank")}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "bank" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Link the account we'll pay</h2>
          <p className="text-sm text-muted-foreground">
            We use Plaid to confirm the account is real, creditable, and in your name. Your bank
            credentials never touch Beekeeper.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" /> US checking or savings only
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Read-only: account number, routing
              number, and account holder name
            </li>
            <li className="flex gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> The payout only ever goes to the account
              you link here
            </li>
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("amount")}>
              Back
            </Button>
            <Button className="flex-1" onClick={linkBank} disabled={linking}>
              {linking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Banknote className="mr-2 h-4 w-4" />
              )}
              {linking ? "Opening bank…" : "Link with Plaid"}
            </Button>
          </div>
        </Card>
      )}

      {step === "confirm" && bank && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Confirm your account</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Bank" value={bank.institution ?? "Linked bank"} />
            <Row label="Account" value={`${bank.accountName} •••• ${bank.mask}`} />
            <Row label="Type" value={bank.subtype} />
            <Row label="Routing" value={`•••• ${bank.routingLast4}`} />
            <Row
              label="Account holder"
              value={bank.holderNames.length ? bank.holderNames.join(", ") : "Not shared by your bank"}
            />
          </dl>
          <Separator />
          <QuoteRows quote={quote} />
          <Row label="You send" value={`${cryptoAmount} ${chain.ticker}`} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("bank")}>
              Use another account
            </Button>
            <Button className="flex-1" onClick={() => setStep("disclaimers")} disabled={!account.data}>
              Looks right
            </Button>
          </div>
        </Card>
      )}

      {step === "disclaimers" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Read this part carefully</h2>
          <p className="text-sm text-muted-foreground">
            Every box has to be checked. We store which ones you accepted, and when, as your sale and
            ACH payout authorization.
          </p>
          <div className="space-y-3">
            {CASHOUT_DISCLAIMERS.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer gap-3 rounded-xl border p-3 text-[13px] leading-relaxed"
              >
                <Checkbox
                  checked={Boolean(accepted[d.id])}
                  onCheckedChange={(v) => setAccepted((s) => ({ ...s, [d.id]: Boolean(v) }))}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  {d.text}
                  {d.id === "terms" && (
                    <>
                      {" "}
                      <Link to="/terms" className="underline">
                        Terms
                      </Link>
                      {" · "}
                      <Link to="/privacy" className="underline">
                        Privacy
                      </Link>
                    </>
                  )}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("confirm")}>
              Back
            </Button>
            <Button className="flex-1" disabled={!allAccepted || placing} onClick={placeOrder}>
              {placing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {placing ? "Opening cash-out…" : `I accept all ${CASHOUT_DISCLAIMERS.length}`}
            </Button>
          </div>
        </Card>
      )}

      {step === "transfer" && order && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Send your {order.asset}</h2>
          <p className="text-sm text-muted-foreground">
            Reference <span className="font-mono text-xs">{order.reference}</span>. Send exactly{" "}
            <span className="font-semibold">
              {order.cryptoAmount} {order.asset}
            </span>{" "}
            on the {order.chainId.toUpperCase()} network to the settlement address below.
          </p>
          <div className="rounded-xl border p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Settlement address
            </div>
            <div className="break-all font-mono text-[12px]">{order.depositAddress}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(order.depositAddress);
                toast.success("Settlement address copied");
              }}
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy address
            </Button>
          </div>
          <p className="flex gap-2 text-[11px] text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Only {order.asset} on {order.chainId.toUpperCase()}. Anything else is unrecoverable.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/wallet/$chain/send" params={{ chain: order.chainId }}>
              <Wallet className="mr-2 h-4 w-4" /> Open Send for {order.asset}
            </Link>
          </Button>
          <Separator />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste your transaction ID once you've sent it
            </label>
            <Input placeholder="Transaction ID / hash" value={txid} onChange={(e) => setTxid(e.target.value)} />
          </div>
          <Button className="w-full" onClick={reportTransfer} disabled={reporting || txid.trim().length < 6}>
            {reporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reporting ? "Recording…" : "I've sent it"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Nothing is lost if you close this — the order stays in your receipts and you can report the
            transaction later from the same screen.
          </p>
        </Card>
      )}

      {step === "done" && order && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Cash-out in review
          </div>
          <p className="text-sm text-muted-foreground">
            Reference <span className="font-mono text-xs">{order.reference}</span> — we're watching for
            your transfer. Once it confirms we'll send {formatUsd(order.netUsd)} to{" "}
            {order.bank.institution ?? "your bank"} •••• {order.bank.mask}, usually within 1–3 business
            days.
          </p>
          <dl className="space-y-2 text-sm">
            <Row label="You sent" value={`${order.cryptoAmount} ${order.asset}`} />
            <Row label="Transaction" value={order.txid ?? "—"} mono />
            <Row label="Gross" value={formatUsd(order.grossUsd)} />
            <Row label="Fee" value={formatUsd(order.feeUsd)} />
            <Row label="Net to bank" value={formatUsd(order.netUsd)} strong />
          </dl>
          <Button asChild className="w-full">
            <Link to="/">Back to my funds</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}

function QuoteRows({ quote }: { quote: { grossUsd: number; feeUsd: number; netUsd: number } }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <Row label="Crypto sold (est.)" value={formatUsd(quote.grossUsd)} />
      <Row label="Service fee" value={formatUsd(quote.feeUsd)} />
      <Row label="Net to your bank" value={formatUsd(quote.netUsd)} strong />
    </dl>
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
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-right ${mono ? "break-all font-mono text-[11px]" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
