// Local-only address book shared across chains. Stored in localStorage.
import { useEffect, useState } from "react";
import type { ChainId } from "@/lib/chains";

const KEY = "lovable-multi-wallet-contacts-v1";
const EVENT = "lovable-wallet:contacts-changed";

export interface Contact {
  id: string;            // uuid-ish
  chain: ChainId;
  address: string;
  label: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

function read(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return (arr as Contact[]).filter(
      (c) => c && typeof c.address === "string" && typeof c.label === "string" && typeof c.chain === "string",
    );
  } catch {
    return [];
  }
}

function write(list: Contact[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function listContacts(chain?: ChainId): Contact[] {
  const all = read().sort((a, b) => a.label.localeCompare(b.label));
  return chain ? all.filter((c) => c.chain === chain) : all;
}

export function upsertContact(input: {
  id?: string;
  chain: ChainId;
  address: string;
  label: string;
  notes?: string;
}): Contact {
  const list = read();
  const addr = input.address.trim();
  const label = input.label.trim();
  if (!addr) throw new Error("Address is required");
  if (!label) throw new Error("Label is required");
  const now = Date.now();
  const i = input.id ? list.findIndex((c) => c.id === input.id) : -1;
  const next: Contact =
    i >= 0
      ? { ...list[i], chain: input.chain, address: addr, label, notes: input.notes?.trim() || undefined, updatedAt: now }
      : { id: uid(), chain: input.chain, address: addr, label, notes: input.notes?.trim() || undefined, createdAt: now, updatedAt: now };
  if (i >= 0) list[i] = next;
  else list.push(next);
  write(list);
  return next;
}

export function removeContact(id: string): void {
  write(read().filter((c) => c.id !== id));
}

export function useContacts(chain?: ChainId): Contact[] {
  const [items, setItems] = useState<Contact[]>(() => listContacts(chain));
  useEffect(() => {
    const refresh = () => setItems(listContacts(chain));
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [chain]);
  return items;
}