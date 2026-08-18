/**
 * Extra features — opt-in toggles and safety checks. Swap is an off-ramp
 * feature, so it is hidden entirely on iOS builds.
 */
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFeature } from "@/lib/wallet/feature-prefs";
import { useHideBalances, setHideBalances } from "@/lib/wallet/hide-balances";
import { nativePlatform } from "@/lib/native/platform";

export function FeaturesCard() {
  const [swap, setSwap] = useFeature("swap");
  const [confirmLast4, setConfirmLast4] = useFeature("confirmLast4");
  const hidden = useHideBalances();
  // Off-ramp / exchange features are not shipped in the iOS build.
  const exchangeAllowed = nativePlatform() !== "ios";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Extra features
        </CardTitle>
        <CardDescription>
          Opt-in features and safety checks. Toggle to fit how you use the wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Row
          id="feat-hide-balances"
          title="Hide balances"
          description="Masks every amount with ••••, so you can open the wallet in public. The eye button in the header does the same thing."
          checked={hidden}
          onChange={setHideBalances}
          icon={hidden ? EyeOff : Eye}
        />

        <Row
          id="feat-confirm-last4"
          title="Confirm last 4 of address"
          description="Before sending, re-type the last 4 characters of the recipient address. Helps catch clipboard-swap malware. On by default."
          checked={confirmLast4}
          onChange={setConfirmLast4}
        />

        {exchangeAllowed && (
          <Row
            id="feat-swap"
            title="In-app swap"
            description="Adds a Swap action to each wallet card. Quotes come from an external exchange partner; transactions are signed on this device."
            checked={swap}
            onChange={setSwap}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  id,
  title,
  description,
  checked,
  onChange,
  icon: Icon,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
          {Icon && <Icon className="h-3.5 w-3.5" />} {title}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
