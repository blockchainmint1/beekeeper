import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WalletPage } from "@/components/wallet/WalletPage";
import { ContactsDialog } from "@/components/wallet/ContactsDialog";
import { CHAIN_LIST } from "@/lib/chains";

export const Route = createFileRoute("/wallet/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  return (
    <WalletPage title="Contacts" subtitle="Saved addresses you send to often">
      <ContactsDialog
        open
        onOpenChange={(v) => !v && navigate({ to: "/wallet" })}
        onSendTo={(c) => {
          const chain = CHAIN_LIST.find((x) => x.id === c.chain);
          if (!chain) return;
          navigate({
            to: "/wallet/$chain/send",
            params: { chain: chain.id },
            search: { to: c.address },
          });
        }}
      />
    </WalletPage>
  );
}
