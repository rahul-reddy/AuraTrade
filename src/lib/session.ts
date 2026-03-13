import { auth } from "@/lib/auth";

export type RequiredSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
};

/**
 * Call at the top of every API route and server action.
 * Throws a 401 Response if the user is not authenticated.
 * Returns a typed session with a guaranteed userId.
 */
export async function getRequiredSession(): Promise<RequiredSession> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name,
    },
  };
}
