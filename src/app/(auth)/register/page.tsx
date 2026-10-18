import AuthShell from "@/components/auth/AuthShell";
import Link from "next/link";
import { connection } from "next/server";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { isRegistrationOpen } from "@/lib/registration";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  // Read the sign-up switch per request, not once at build time.
  await connection();
  if (isRegistrationOpen()) return <RegisterForm />;

  return (
    <AuthShell>
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="space-y-1">
          <p className="eyebrow mb-3">Your trading workspace</p>
          <CardTitle role="heading" aria-level={1} className="text-2xl text-foreground">Sign-up is closed</CardTitle>
          <CardDescription className="text-zinc-400">
            This AuraTrade server is private. Accounts are created by its owner.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm text-primary hover:text-primary">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
