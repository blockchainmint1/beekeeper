import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/manifesto")({
  head: () => ({
    meta: [
      { title: "Manifesto — Beekeeper Wallet" },
      {
        name: "description",
        content:
          "Why we built Beekeeper: honest money, held by the person who earned it. No custodians, no permission, no rent.",
      },
      { property: "og:title", content: "Manifesto — Beekeeper Wallet" },
      {
        property: "og:description",
        content: "Honest money, held by the person who earned it. No custodians, no rent.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://beekeeper.money/manifesto" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://beekeeper.money/manifesto" }],
  }),
  component: Manifesto,
});

function Manifesto() {
  return (
    <LegalPage title="Manifesto" updated="August 2026">
      <p className="text-base text-foreground">
        Money should belong to the person who earned it. That's the whole idea.
      </p>

      <h2>1. Possession is the feature</h2>
      <p>
        A balance you can be locked out of isn't your money — it's a favour. Beekeeper holds no keys,
        no accounts, and no ledger of you. Your recovery phrase lives on your device and on a piece of
        metal in your safe. That's it.
      </p>

      <h2>2. No permission required</h2>
      <p>
        No signup, no email, no ID check, no waiting for approval. Scan your coin, set a password,
        start working. A merchant in a small town should be able to accept honest money before lunch.
      </p>

      <h2>3. Fees are rent</h2>
      <p>
        Every percent skimmed off a sale is rent charged for standing between two people who already
        agreed on a price. We take none of it. The only cost is the network fee the chain itself
        charges to confirm your transaction.
      </p>

      <h2>4. Irreversible is honest</h2>
      <p>
        Chargebacks exist because someone else controls the money. When settlement is final, the
        merchant keeps what they earned. The trade-off is care: verify the address, verify the amount,
        then sign.
      </p>

      <h2>5. Open by default</h2>
      <p>
        Standard derivation paths, standard signatures, standard chains. Your seed works in other
        wallets, and other wallets' seeds work here. We want to be replaceable — that's what keeps us
        honest. You can learn everything about the TEXITcoin blockchain and the Omni layer 2 at{" "}
        <a
          href="https://texitcoin.org/build"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          texitcoin.org/build
        </a>
        .
      </p>

      <h2>6. Boring beats clever</h2>
      <p>
        No yield, no points, no tokens to sell you. A wallet's job is to show what you have and move
        it when you say so. Beekeeper is built to be dull, fast, and still working in ten years.
      </p>

      <h2>7. One hive</h2>
      <p>
        Beekeeper is part of the{" "}
        <a
          href="https://honest.money"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          honest.money
        </a>{" "}
        ecosystem — the wallet, the payment rails, and the merchants using them. Every bee keeps its
        own honey.
      </p>
    </LegalPage>
  );
}
