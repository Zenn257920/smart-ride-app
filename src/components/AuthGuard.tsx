"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

/** Client-side auth guard: redirects to /login when unauthenticated.
 *  Shows a loading state and never flashes protected content. */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <div className="page-wrap flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-forest/60 dark:text-mint/60">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}
