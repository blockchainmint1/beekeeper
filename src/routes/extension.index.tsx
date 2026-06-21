import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Puzzle, ShieldCheck, Chrome } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/extension/")({
  head: () => ({
    meta: [
      { title: "Install Browser Extension — Honest Money" },
      {
        name: "description",
        content:
          "Install the Honest Money browser extension to sign in to websites and connect dapps without exporting your keys.",
      },
    ],
  }),
  component: ExtensionInstallPage,
});

function ExtensionInstallPage() {
  async function download() {
    try {
      const res = await fetch("/honest-money-extension.zip");
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "honest-money-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Extension ZIP downloaded");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto max-w-2xl pt-8">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Puzzle className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Honest Money Browser Extension</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to websites and connect dapps without your keys ever leaving the wallet.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Chrome className="h-5 w-5" /> Install in Chrome, Edge, Brave or Arc
            </CardTitle>
            <CardDescription>
              The extension is a Manifest V3 package. You install it unpacked in Developer mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ol className="space-y-4 list-decimal list-inside text-sm text-foreground/85">
              <li>
                <span className="font-medium">Download the ZIP</span>
                <div className="mt-2">
                  <Button onClick={download}>
                    <Download className="mr-2 h-4 w-4" /> Download honest-money-extension.zip
                  </Button>
                </div>
              </li>
              <li>
                <span className="font-medium">Unzip the file</span> on your computer.
              </li>
              <li>
                Open <code className="rounded bg-muted px-1.5 py-0.5 text-xs">chrome://extensions</code> in your Chromium browser.
              </li>
              <li>
                Turn on <span className="font-medium">Developer mode</span> (toggle in the top-right).
              </li>
              <li>
                Click <span className="font-medium">Load unpacked</span> and select the unzipped <code className="rounded bg-muted px-1.5 py-0.5 text-xs">extension</code> folder.
              </li>
              <li>
                Click the Honest Money icon in your toolbar, then click <span className="font-medium">Pair with this browser</span>.
              </li>
            </ol>

            <div className="rounded-xl border border-border bg-muted/40 p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="text-xs text-muted-foreground">
                The extension never stores your seed. Every signing request opens your wallet in a popup for approval.
              </div>
            </div>

            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <Link to="/">← Back to wallet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
