import { GlobalSearchClient } from "@/components/global-search";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell-server";
import { IconPlus } from "@/components/icons";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { getSession, PERMISSIONS, hasPermission } from "@/lib/auth";

/**
 * Application top bar.
 *
 * Holds only what a clinician needs from anywhere: identify the patient or
 * referral, see what is waiting, create a referral, and reach their account.
 * Page-specific filters live inside each page rather than here.
 */
export async function TopBar({
  user,
  awaitingCount,
  canCreate,
}: {
  user: { name: string; email: string; role: string; facility: string };
  awaitingCount: number;
  canCreate: boolean;
}) {
  const session = await getSession();
  const canSearch =
    !!session &&
    (hasPermission(session, PERMISSIONS.PATIENT_READ) ||
      hasPermission(session, PERMISSIONS.REFERRAL_READ_OWN_FACILITY));

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200/80 bg-canvas/85 px-5 py-2.5 backdrop-blur-md lg:px-8 no-print">
      <div className="min-w-0 flex-1">{canSearch && <GlobalSearchClient />}</div>

      <div className="flex shrink-0 items-center gap-2">
        {canCreate && (
          <Link href="/referrals/new" className="btn-primary btn-sm">
            <IconPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New referral</span>
          </Link>
        )}

        <NotificationBell awaitingCount={awaitingCount} />

        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          facility={user.facility}
          logout={logoutAction}
        />
      </div>
    </header>
  );
}
