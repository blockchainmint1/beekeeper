import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Beekeeper Wallet" },
      {
        name: "description",
        content:
          "The terms that govern your use of Beekeeper, a self-custody wallet from Honest Money. No custody, no accounts, no reversals.",
      },
      { property: "og:title", content: "Terms of Use — Beekeeper Wallet" },
      {
        property: "og:description",
        content: "Terms governing Beekeeper, the self-custody wallet from Honest Money.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://beekeeper.money/terms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://beekeeper.money/terms" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="August 2026">
      <p>
        Beekeeper ("the app") is self-custody wallet software published by Honest Money. By
        installing or using the app you agree to these terms. If you do not agree, do not use the
        app.
      </p>

      <h2>1. Self-custody — you are the bank</h2>
      <p>
        Beekeeper is <strong>non-custodial</strong>. Your recovery phrase and private keys are
        generated and stored on your device, encrypted with a password you choose. We never receive,
        transmit, escrow, or hold your keys or your funds.
      </p>
      <ul>
        <li>We cannot recover your wallet if you lose your recovery phrase.</li>
        <li>We cannot reverse, cancel, refund, or freeze a transaction you sign.</li>
        <li>We cannot access, move, or block your funds on your behalf.</li>
      </ul>

      <h2>2. No financial services</h2>
      <p>
        We do not exchange currency, take deposits, extend credit, provide money transmission, or
        offer investment, tax, or legal advice. Beekeeper is a tool that helps you sign your own
        transactions on public blockchains.
      </p>

      <h2>3. Your responsibilities</h2>
      <ul>
        <li>Back up your recovery phrase offline and keep it private. Anyone with it owns your funds.</li>
        <li>Verify every address, amount, chain, and fee before signing.</li>
        <li>Keep your device, OS, and the app updated, and use a device lock.</li>
        <li>Comply with the laws and tax rules that apply to you.</li>
      </ul>

      <h2>4. Blockchains and third-party services</h2>
      <p>
        Balances, history, prices, and broadcasts rely on public blockchains and third-party data
        providers and nodes. These can be delayed, incomplete, rate-limited, or unavailable. Displayed
        fiat values are estimates only. Network fees are set by the network, not by us.
      </p>

      <h2>5. Merchant linking</h2>
      <p>
        If you link Beekeeper to a NectarPay merchant account, the app shares{" "}
        <strong>watch-only extended public keys (xpubs)</strong> so that merchant can generate receive
        addresses for you. Extended public keys cannot spend funds. You approve each link explicitly
        and can stop using the feature at any time.
      </p>

      <h2>6. No warranty</h2>
      <p>
        The app is provided "as is" and "as available", without warranties of any kind, express or
        implied, including merchantability, fitness for a particular purpose, and non-infringement.
        Cryptography and blockchain software carry inherent risk, including total loss of funds.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Honest Money and its contributors are not liable for
        any lost funds, lost keys, lost profits, or indirect, incidental, special, consequential, or
        punitive damages arising from your use of the app.
      </p>

      <h2>8. Acceptable use</h2>
      <p>
        Do not use the app for unlawful activity, and do not attempt to interfere with, reverse the
        security of, or abuse the services the app depends on.
      </p>

      <h2>9. Changes and termination</h2>
      <p>
        We may update the app and these terms. Continued use after an update means you accept the
        revised terms. You may stop using the app at any time by erasing the wallet from your device
        (Settings → Danger zone) and uninstalling it — your funds remain recoverable from your
        recovery phrase in any compatible wallet.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href="mailto:hello@honest.money" className="underline underline-offset-2">
          hello@honest.money
        </a>
        .
      </p>
    </LegalPage>
  );
}
