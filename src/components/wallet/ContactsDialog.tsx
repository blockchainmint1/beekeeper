import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookUser, Pencil, Plus, Search, Trash2, X, Send as SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHAIN_LIST, CHAINS, type ChainId } from "@/lib/chains";
import { useContacts, upsertContact, removeContact, type Contact } from "@/lib/wallet/contacts";
import { validateUtxoAddress } from "@/lib/wallet/utxo";
import { isValidEvmAddress } from "@/lib/wallet/evm";

export function ContactsDialog({
  open,
  onOpenChange,
  initialChain,
  onSendTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialChain?: ChainId;
  onSendTo?: (c: Contact) => void;
}) {
  const all = useContacts();
  const [query, setQuery] = useState("");
  const [filterChain, setFilterChain] = useState<ChainId | "all">(initialChain ?? "all");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (filterChain !== "all" && c.chain !== filterChain) return false;
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [all, query, filterChain]);

  const isEditing = editing !== null || creating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookUser className="h-4 w-4" /> Address book
          </DialogTitle>
          <DialogDescription>
            Saved locally in this browser. Pick contacts when sending or jump straight to send.
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <ContactForm
            initial={editing}
            defaultChain={initialChain}
            onDone={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search label or address"
                  className="pl-7"
                />
              </div>
              <Select value={filterChain} onValueChange={(v) => setFilterChain(v as ChainId | "all")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All chains</SelectItem>
                  {CHAIN_LIST.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.ticker}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>

            <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  {all.length === 0 ? "No contacts yet." : "No matches."}
                </p>
              ) : (
                filtered.map((c) => {
                  const chain = CHAINS[c.chain];
                  return (
                    <div
                      key={c.id}
                      className="group flex items-start justify-between gap-2 rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{c.label}</span>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                            style={{ borderColor: chain.color, color: chain.color }}
                          >
                            {chain.ticker}
                          </Badge>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {c.address}
                        </div>
                        {c.notes && (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.notes}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                        {onSendTo && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Send to"
                            onClick={() => onSendTo(c)}
                          >
                            <SendIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setEditing(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => {
                            if (confirm(`Delete contact "${c.label}"?`)) {
                              removeContact(c.id);
                              toast.success("Contact removed");
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  initial,
  defaultChain,
  onDone,
}: {
  initial: Contact | null;
  defaultChain?: ChainId;
  onDone: () => void;
}) {
  const [chain, setChain] = useState<ChainId>(initial?.chain ?? defaultChain ?? "txc");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(initial);

  const save = async () => {
    setBusy(true);
    try {
      const trimmed = address.trim();
      if (!trimmed) throw new Error("Address is required");
      const cfg = CHAINS[chain];
      const ok = cfg.kind === "evm" ? isValidEvmAddress(trimmed) : await validateUtxoAddress(trimmed, cfg);
      if (!ok) throw new Error(`Not a valid ${cfg.ticker} address`);
      upsertContact({ id: initial?.id, chain, address: trimmed, label, notes: notes.trim() || undefined });
      toast.success(isEdit ? "Contact updated" : "Contact saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save contact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Chain</Label>
        <Select value={chain} onValueChange={(v) => setChain(v as ChainId)} disabled={isEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHAIN_LIST.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.ticker})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="c-addr" className="text-xs">Address</Label>
        <Input
          id="c-addr"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={CHAINS[chain].kind === "evm" ? "0x…" : "txc1… / isk1…"}
          className="font-mono text-xs sm:text-sm"
          disabled={isEdit}
        />
      </div>
      <div>
        <Label htmlFor="c-label" className="text-xs">Label</Label>
        <Input
          id="c-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Exchange withdrawal, Alice…"
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="c-notes" className="text-xs">Notes (optional)</Label>
        <Textarea id="c-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !address || !label} onClick={save}>
          {isEdit ? "Save" : "Add contact"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}