"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Wrong password.");
      return;
    }
    router.replace(params.get("next") || "/");
    router.refresh();
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm"
    >
      <div className="mb-6 text-center">
        <div className="text-3xl">🧠</div>
        <h1 className="mt-2 text-xl font-semibold">Study Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private notebook. Enter your site password.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
          className="h-11 text-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button className="mt-6 w-full" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/40 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
