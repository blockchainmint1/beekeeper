import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Beekeeper Wallet" },
      {
        name: "description",
        content:
          "Beekeeper collects no accounts, no email, no analytics and no personal data. Your keys and wallet stay encrypted on your device.",
      },
      { property: "og:title", content: "Privacy Policy — Beekeeper Wallet" },
      {
        property: "og:description",
        content: "No accounts, no analytics, no personal data. Keys never leave your device.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://beekeeper.money/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://beekeeper.money/privacy" }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2026">
      <p>
        Beekeeper is published by Honest Money. The short version:{" "}
        <strong>we don't have an account system, and we don't collect your personal data.</strong>
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>No name, email, phone number, address, or government ID.</li>
        <li>No recovery phrase, private key, or wallet password — these never leave your device.</li>
        <li>No advertising identifiers, no ad networks, no cross-app tracking.</li>
        <li>No third-party analytics or behavioural profiling inside the app.</li>
      </ul>

      <h2>What stays on your device</h2>
      <p>
        Your recovery phrase is encrypted with your password and stored only in your device's local
        app storage, alongside your local preferences (visible chains, contacts you add, notification
        history, and — if you enable it — a password entry protected by your OS Keychain / Keystore for
        biometric unlock). Erasing the wallet in Settings → Danger zone or uninstalling the app removes
        this data.
      </p>

      <h2>Camera</h2>
      <p>
        The camera is used only while you have a scanner open, to read QR codes (recovery coin,
        addresses, payment requests, signing and merchant-link requests). Frames are processed on the
        device in real time. No image, video, or scan is stored or transmitted.
      </p>

      <h2>Network requests</h2>
      <p>
        To show balances, history, and prices, and to broadcast the transactions you sign, the app
        queries public blockchain nodes, block explorers, and price feeds. Those requests necessarily
        include the blockchain addresses being looked up and your IP address, and are handled under
        the privacy policies of those providers. Some of these calls are proxied through our own
        server so that provider API keys stay server-side; we do not build user profiles from them.
        We use no cookies for tracking.
      </p>

      <h2>Merchant linking (NectarPay)</h2>
      <p>
        If you choose to link a NectarPay merchant account, the app sends watch-only extended public
        keys and a signature proving you control the wallet, to the merchant endpoint encoded in the
        QR code you scan. Extended public keys cannot spend funds. Nothing is sent unless you approve
        the specific request on screen.
      </p>

      <h2>Children</h2>
      <p>
        The app is not directed to children under 13, and we knowingly collect no data from them.
      </p>

      <h2>Your rights</h2>
      <p>
        Because we hold no personal data about you, there is nothing for us to export or delete on
        your behalf. You control all local data directly on your device.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes we will update this page and the "last updated" date, and note it in
        the app release notes.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href="mailto:privacy@honest.money" className="underline underline-offset-2">
          privacy@honest.money
        </a>
        .
      </p>
    </LegalPage>
  );
}
