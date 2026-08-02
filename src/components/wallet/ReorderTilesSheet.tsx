import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CHAIN_LIST, type ChainId } from "@/lib/chains";
import { getVisibleChainIds, setVisibleChainIds } from "@/lib/wallet/visible-chains";
import { getChainLabel, setChainLabel } from "@/lib/wallet/chain-labels";
import { AssetBadge } from "./AssetBadge";

/**
 * Long-press sheet for reordering, renaming and hiding wallet cards.
 * Order is the visible-chain array order, so the carousel follows it directly.
 */
export function ReorderTilesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [order, setOrder] = useState<ChainId[]>([]);
  const [hiddenIds, setHiddenIds] = useState<ChainId[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const visible = getVisibleChainIds();
    setOrder(visible);
    setHiddenIds(CHAIN_LIST.map((c) => c.id).filter((id) => !visible.includes(id)));
    const next: Record<string, string> = {};
    for (const c of CHAIN_LIST) next[c.id] = getChainLabel(c.id, c.name);
    setLabels(next);
  }, [open]);

  function move(index: number, dir: -1 | 1) {
    setOrder((cur) => {
      const next = [...cur];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function hide(id: ChainId) {
    if (order.length <= 1) return;
    setOrder((cur) => cur.filter((x) => x !== id));
    setHiddenIds((cur) => [...cur, id]);
  }

  function show(id: ChainId) {
    setHiddenIds((cur) => cur.filter((x) => x !== id));
    setOrder((cur) => [...cur, id]);
  }

  function save() {
    setVisibleChainIds(order);
    for (const c of CHAIN_LIST) {
      const v = labels[c.id] ?? "";
      setChainLabel(c.id, v === c.name ? "" : v);
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Arrange your wallets</SheetTitle>
          <SheetDescription>
            Reorder the carousel, give each wallet a nickname, or hide the ones you don't use.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {order.map((id, i) => {
            const chain = CHAIN_LIST.find((c) => c.id === id);
            if (!chain) return null;
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl border border-border p-2">
                <AssetBadge chain={chain} size={32} />
                <Input
                  value={labels[id] ?? ""}
                  onChange={(e) => setLabels((cur) => ({ ...cur, [id]: e.target.value }))}
                  placeholder={chain.name}
                  className="h-9 flex-1"
                />
                <span className="text-[11px] font-medium text-muted-foreground tabular w-10 shrink-0">
                  {chain.ticker}
                </span>
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${chain.name} up`}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  aria-label={`Move ${chain.name} down`}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => hide(id)}
                  aria-label={`Hide ${chain.name}`}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {hiddenIds.length > 0 && (
          <>
            <div className="mt-5 text-[10.5px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
              Hidden
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const chain = CHAIN_LIST.find((c) => c.id === id);
                if (!chain) return null;
                return (
                  <button
                    key={id}
                    onClick={() => show(id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Eye className="w-3.5 h-3.5" /> {chain.ticker}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <Button onClick={save} className="mt-6 w-full">
          <Check className="mr-2 h-4 w-4" /> Save arrangement
        </Button>
      </SheetContent>
    </Sheet>
  );
}
