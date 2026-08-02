import { Link } from "@tanstack/react-router";
import { versionLabel } from "@/lib/version";

/**
 * Shared site footer. Required on every public surface — the app stores need a
 * reachable Privacy Policy and Terms link, and every honest.money property
 * carries the ecosystem link.
 */
export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60 px-4 py-8 text-center">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xs text-muted-foreground">
          Part of the{" "}
          <a
            href="https://honest.money"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            honest.money
          </a>{" "}
          ecosystem.
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/manifesto" className="hover:text-foreground">
            Manifesto
          </Link>
          <span aria-hidden>·</span>
          <a
            href="https://texitcoin.org/build"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Build on TEXITcoin
          </a>
        </nav>

        <p className="text-[11px] text-muted-foreground/70">
          Beekeeper is a self-custody wallet. You hold your own keys — no one, including us, can
          move, freeze, or recover your funds.
        </p>
      </div>
    </footer>
  );
}
