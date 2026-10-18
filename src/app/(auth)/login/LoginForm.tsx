"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm({ registrationOpen }: { registrationOpen: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
      <CardHeader className="space-y-1">
        <p className="eyebrow mb-3">Welcome back</p>
        <CardTitle role="heading" aria-level={1} className="text-3xl tracking-tight text-foreground">Sign in</CardTitle>
        <CardDescription className="text-zinc-400">
          Pick up where your last session left off.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          {searchParams.get("registered") === "1" && <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-primary">Your account is ready. Sign in to start exploring.</div>}
          {error && (
            <div role="alert" className="rounded-md bg-loss/10 border border-loss/20 px-4 py-3 text-sm text-loss">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-zinc-800 border-zinc-700 text-foreground placeholder:text-zinc-500 focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-zinc-800 border-zinc-700 pr-12 text-foreground placeholder:text-zinc-500 focus:border-primary"
            />
            <button type="button" aria-label={showPassword ? "Hide characters" : "Show characters"} aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-400 hover:text-foreground">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>

          {registrationOpen && (
            <p className="text-sm text-zinc-400 text-center">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-primary hover:text-primary">
                Create one
              </Link>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
