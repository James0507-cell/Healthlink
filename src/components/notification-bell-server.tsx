import { getSession } from "@/lib/auth";
import { listReferrals } from "@/lib/referrals";
import { STATES, PRIORITY_RANK, type ReferralState } from "@/lib/workflow";
import { NotificationBellClient, type NotificationItem } from "@/components/notification-bell";

/** Server wrapper: loads this facility's outstanding work for the bell. */
export async function NotificationBell({ awaitingCount }: { awaitingCount: number }) {
  const session = await getSession();
  if (!session) return <NotificationBellClient awaitingCount={0} items={[]} />;

  let items: NotificationItem[] = [];
  try {
    const { rows } = await listReferrals(session, { side: "all", limit: 40, includeDrafts: false });
    const isCross = session.role === "hie_admin" || session.role === "privacy_auditor";

    items = rows
      .filter((r) => {
        const def = STATES[r.status as ReferralState];
        if (!def || def.isTerminal || def.awaiting === "none") return false;
        if (isCross) return true;
        return def.awaiting === "referring"
          ? r.referring_facility_id === session.facilityId
          : r.receiving_facility_id === session.facilityId;
      })
      .sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority] ?? 9;
        const pb = PRIORITY_RANK[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(a.status_updated_at).getTime() - new Date(b.status_updated_at).getTime();
      })
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        referralNumber: r.referral_number,
        patientName: r.patient_name,
        status: r.status,
        updatedAt: r.status_updated_at,
        href: `/referrals/${r.id}`,
      }));
  } catch {
    items = [];
  }

  return <NotificationBellClient awaitingCount={awaitingCount} items={items} />;
}
