"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
    >
      Sign out
    </Button>
  );
}
