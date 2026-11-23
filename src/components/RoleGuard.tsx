"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import type { UserRole } from "@/lib/roles";

interface RoleGuardProps {
  /** Roles allowed on this page. */
  allow: UserRole[];
  /** Where to send a wrong-role user (omit to show the message with no redirect). */
  redirectTo?: string;
  /** Burmese message shown to a wrong-role user. */
  message: string;
  /** Optional action shown under the message (e.g. a link to /register). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Client-side role guard — used inside AuthGuard, so a session exists.
 * The server routes enforce the same rules; this only keeps the UI
 * from showing a page the user cannot use. A wrong-role user sees a
 * Burmese explanation and, when redirectTo is set, is sent away.
 * The role is read from the session copy (safe here: a role is chosen
 * once at signup and never changes, so it cannot go stale).
 */
export default function RoleGuard({ allow, redirectTo, message, action, children }: RoleGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const user = session?.user as { user_type?: string } | undefined;
  const role: UserRole = user?.user_type === "driver" ? "driver" : "passenger";
  const allowed = allow.includes(role);

  useEffect(() => {
    if (!isPending && session?.user && !allowed && redirectTo) {
      router.replace(redirectTo);
    }
  }, [isPending, session, allowed, redirectTo, router]);

  if (isPending || !session?.user) return <>{children}</>;
  if (!allowed) {
    return (
      <div className="page-wrap max-w-xl">
        <div className="card">
          <p className="text-sm leading-relaxed text-forest dark:text-mint">{message}</p>
          {action ? <div className="mt-4">{action}</div> : null}
          {redirectTo ? (
            <p className="mt-3 text-xs text-forest/60 dark:text-mint/60">ပို့ဆောင်နေပါသည်…</p>
          ) : null}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
