import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Info,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getChain, type ChainId } from "@/lib/chains";
import { useChainAccount } from "@/components/wallet/session";
import {
  TOPUP_ASSETS,
  TOPUP_DISCLAIMERS,
  TOPUP_FIRST_ORDER_MAX_USD,
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  TOPUP_PACKAGES,
  TRADE_DESK_URL,
  formatUsd,
  quoteTopUp,
} from "@/lib/topup/packages";
import { openPlaidLink } from "@/lib/topup/plaid-link";
import { createTopUpLinkToken, submitTopUpOrder, verifyTopUpBank } from "@/lib/topup/plaid.functions";
import { hasCompletedTopUp, saveTopUpOrder } from "@/lib/topup/orders";
import type { BankSummary, TopUpOrderRecord } from "@/lib/topup/types";
import { getVaultFingerprint } from "@/lib/wallet/seed";

type Step = "intro" | "package" | "bank" | "confirm" | "disclaimers" | "review" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "intro", label: "Start" },
  { id: "package", label: "Amount" },
  { id: "bank", label: "Bank" },
  { id: "confirm", label: "Confirm" },
  { id: "disclaimers", label: "Authorize" },
  { id: "review", label: "Order" },
];

export function TopUpWizard({ available }: { available: boolean }) {
  const [step, setStep] = useState<Step>("intro");
  const [usd, setUsd] = useState<number>(100);
  const [customUsd, setCustomUsd] = useState("");
  const [asset, setAsset] = useState<ChainId>("txc");
  const [bank, setBank] = useState<BankSummary | null>(null);
  const [linking, setLinking] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<TopUpOrderRecord | null>(null);

  const chain = getChain(asset);
  const deliveryTicker = TOPUP_ASSETS.find((a) => a.chain === asset)?.ticker ?? chain.ticker;
  const account = useChainAccount(chain);
  const quote = useMemo(() => quoteTopUp(usd), [usd]);
  const isFirstOrder = useMemo(() => !hasCompletedTopUp(), []);
  const cap = isFirstOrder ? TOPUP_FIRST_ORDER_MAX_USD : TOPUP_MAX_USD;
  const allAccepted = TOPUP_DISCLAIMERS.every((d) => accepted[d.id]);

  async function linkBank() {
    setLinking(true);
    try {
      const clientUserId = getVaultFingerprint() || "beekeeper-guest";
      const { linkToken } = await createTopUpLinkToken({
        data: {
          clientUserId,
          redirectUri:
            typeof window !== "undefined" && window.location.protocol === "https:"
              ? `${window.location.origin}/wallet/topup`
              : undefined,
        },
      });
      const outcome = await openPlaidLink(linkToken);
      const summary = await verifyTopUpBank({
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
    if (!bank || !account.data) return;
    setPlacing(true);
    try {
      const rec = await submitTopUpOrder({
        data: {
          sealedRef: bank.sealedRef,
          usd,
          asset: deliveryTicker,
          destinationAddress: account.data.account.address,
          acceptedDisclaimers: TOPUP_DISCLAIMERS.filter((d) => accepted[d.id]).map((d) => d.id),
          isFirstOrder,
        },
      });
      saveTopUpOrder(rec);
      setOrder(rec);
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't place that order.");
    } finally {
      setPlacing(false);
    }
  }

  if (!available) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-amber-500" /> Bank top-ups aren't switched on yet
        </div>
        <p className="text-sm text-muted-foreground">
          Buying with a US bank account needs our onramp partner's live credentials. Until then you can
          fund the wallet by receiving crypto, or talk to the trade desk for a wire.
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
          <h2 className="text-lg font-semibold">Add value with your bank</h2>
          <p className="text-sm text-muted-foreground">
            Link a US checking or savings account, pick an amount, and we'll buy crypto and deliver it
            straight to your self-custodied Beekeeper address. No custody, no holding account.
          </p>
          <ul className="space-y-2 text-sm">
            {[
              "ACH debit clears in 1–3 business days — delivery happens after the funds clear.",
              "Your bank credentials go to Plaid, never to us. We only see a masked account and a balance check.",
              "Self-serve orders top out at " + formatUsd(TOPUP_MAX_USD) + "; bigger tickets go to the trade desk.",
              "You keep your keys. This buys into the wallet you already control.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={() => setStep("package")}>
            Get started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      )}

      {step === "package" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Pick your package</h2>
          <div className="grid grid-cols-2 gap-3">
            {TOPUP_PACKAGES.map((p) => {
              const disabled = p.usd > cap;
              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  onClick={() => {
                    setUsd(p.usd);
                    setCustomUsd("");
                  }}
                  className={`rounded-2xl border p-3 text-left transition disabled:opacity-40 ${
                    usd === p.usd && !customUsd ? "border-primary bg-primary/5" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="text-base font-semibold">{formatUsd(p.usd)}</div>
                  <div className="text-xs font-medium">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {disabled ? `Over your ${formatUsd(cap)} limit` : p.blurb}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Or a custom amount (USD)</label>
            <Input
              inputMode="decimal"
              placeholder={`${TOPUP_MIN_USD} – ${cap}`}
              value={customUsd}
              onChange={(e) => {
                setCustomUsd(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setUsd(n);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Deliver as</label>
            <div className="flex flex-wrap gap-2">
              {TOPUP_ASSETS.map((a) => (
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

          <Separator />
          <QuoteRows quote={quote} />

          {isFirstOrder && (
            <p className="text-[11px] text-muted-foreground">
              Your first order is capped at {formatUsd(TOPUP_FIRST_ORDER_MAX_USD)} until one ACH debit
              settles. After that your limit rises to {formatUsd(TOPUP_MAX_USD)}.
            </p>
          )}
          {usd > cap && (
            <p className="text-[11px] text-destructive">
              Over your current limit —{" "}
              <a className="underline" href={TRADE_DESK_URL} target="_blank" rel="noreferrer">
                talk to the trade desk
              </a>{" "}
              for larger orders.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("intro")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!(usd >= TOPUP_MIN_USD && usd <= cap)}
              onClick={() => setStep("bank")}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "bank" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Link your bank account</h2>
          <p className="text-sm text-muted-foreground">
            We use Plaid to confirm the account is real, debitable, and has the funds. You sign in with
            your bank — your credentials never touch Beekeeper.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" /> US checking or savings only
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Read-only: account number, routing
              number, balance, and account holder name
            </li>
            <li className="flex gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> You can unlink at any time from
              Settings
            </li>
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("package")}>
              Back
            </Button>
            <Button className="flex-1" onClick={linkBank} disabled={linking}>
              {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
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
            <Row
              label="Available balance"
              value={bank.availableBalance !== null ? formatUsd(bank.availableBalance) : "Not shared"}
            />
          </dl>
          <Separator />
          <QuoteRows quote={quote} />
          <Row label="Delivered to" value={account.data?.account.address ?? "Deriving…"} mono />
          {bank.availableBalance !== null && bank.availableBalance < quote.totalDebitUsd && (
            <p className="flex gap-2 text-[11px] text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              This account's available balance is below the total debit. The order will be declined at
              submit.
            </p>
          )}
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
            Every box has to be checked. We store which ones you accepted, and when, as your ACH
            authorization record.
          </p>
          <div className="space-y-3">
            {TOPUP_DISCLAIMERS.map((d) => (
              <label key={d.id} className="flex cursor-pointer gap-3 rounded-xl border p-3 text-[13px] leading-relaxed">
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
            <Button className="flex-1" disabled={!allAccepted} onClick={() => setStep("review")}>
              I accept all {TOPUP_DISCLAIMERS.length}
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && bank && (
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-semibold">Place your order</h2>
          <dl className="space-y-2 text-sm">
            <Row label="You pay" value={formatUsd(quote.totalDebitUsd)} />
            <Row label="Debited from" value={`${bank.institution ?? "Bank"} •••• ${bank.mask}`} />
            <Row label="You receive" value={`${formatUsd(quote.usd)} of ${deliveryTicker}`} />
            <Row label="Destination" value={account.data?.account.address ?? ""} mono />
            <Row label="Settlement" value="1–3 business days, delivery after funds clear" />
          </dl>
          <p className="text-[11px] text-muted-foreground">
            Pressing the button authorizes a one-time ACH debit of{" "}
            {formatUsd(quote.totalDebitUsd)}. We run a live balance and return-risk check before the
            order is accepted.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("disclaimers")}>
              Back
            </Button>
            <Button className="flex-1" onClick={placeOrder} disabled={placing}>
              {placing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {placing ? "Checking your bank…" : `Authorize ${formatUsd(quote.totalDebitUsd)}`}
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && order && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Order placed
          </div>
          <p className="text-sm text-muted-foreground">
            Reference <span className="font-mono text-xs">{order.id.slice(0, 8)}</span> — we're debiting{" "}
            {formatUsd(order.totalDebitUsd)} and delivering {order.asset} to your wallet once the funds
            clear.
          </p>
          <div className="space-y-2">
            {order.confidence.checks.map((c) => (
              <div key={c.id} className="flex gap-2 rounded-xl border p-2.5 text-[12px]">
                {c.status === "pass" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                )}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-muted-foreground">{c.detail}</span>
                </span>
              </div>
            ))}
          </div>
          <Button asChild className="w-full">
            <Link to="/">Back to my funds</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}

function QuoteRows({ quote }: { quote: { usd: number; feeUsd: number; totalDebitUsd: number } }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <Row label="Crypto purchased" value={formatUsd(quote.usd)} />
      <Row label="Service fee" value={formatUsd(quote.feeUsd)} />
      <Row label="Total ACH debit" value={formatUsd(quote.totalDebitUsd)} strong />
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
