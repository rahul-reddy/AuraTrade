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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="text-white font-semibold text-lg">AuraTrade</span>
          </div>
          <CardTitle className="text-2xl text-white">Sign-up is closed</CardTitle>
          <CardDescription className="text-zinc-400">
            This AuraTrade server is private. Accounts are created by its owner.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm text-blue-400 hover:text-blue-300">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
