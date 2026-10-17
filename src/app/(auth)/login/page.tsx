import { Suspense } from "react";
import { connection } from "next/server";
import { isRegistrationOpen } from "@/lib/registration";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // Read the sign-up switch per request, not once at build time.
  await connection();
  const registrationOpen = isRegistrationOpen();

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md h-96 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
        }
      >
        <LoginForm registrationOpen={registrationOpen} />
      </Suspense>
    </div>
  );
}
