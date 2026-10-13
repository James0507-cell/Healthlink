import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSession,
  ROLE_LABELS,
  activeSessions,
  ROLE_PERMISSIONS,
  type Role,
  requirePageSession,
} from "@/lib/auth";
import { all, get } from "@/lib/db";
import { Card, PageHeader, Fact, formatDateTime, relativeTime, Alert, maskId } from "@/components/ui";
import { IconClock, IconShield, IconKey, IconExternal } from "@/components/icons";
import { PHCORE_IG } from "@/lib/fhir/terminology";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

/**
 * Account and access overview.
 *
 * Answers the two questions a clinician actually asks: what can I do, and what
 * has been done with my account? The permission list is generated from the same
 * table the authorisation layer enforces, so it cannot drift from reality.
 */
export default async function AccountPage() {
  const session = await requirePageSession();
  if (!session) redirect("/login");

  const user = get<{
    id: string;
    email: string;
    full_name: string;
    family_name: string | null;
    given_name: string | null;
    prc_license: string | null;
    specialization: string | null;
    phone: string | null;
    role: string;
    last_login_at: string | null;
    created_at: string;
  }>("SELECT * FROM users WHERE id = ?", session.id);

  const facility = session.facilityId
    ? get<{
        name: string;
        level: string | null;
        ownership: string | null;
        city_display: string | null;
        nhfr_code: string | null;
        hcpn_code: string | null;
        philhealth_pan: string | null;
      }>("SELECT * FROM facilities WHERE id = ?", session.facilityId)
    : undefined;

  const sessions = activeSessions(session.id);
  const permissions = ROLE_PERMISSIONS[session.role as Role] ?? [];

  // This user's own recent activity, which they are entitled to see.
  const myActivity = all<{ occurred_at: string; event_type: string; description: string; outcome: string }>(
    "SELECT occurred_at, event_type, description, outcome FROM audit_events WHERE actor_user_id = ? ORDER BY occurred_at DESC LIMIT 10",
    session.id,
  );

  const PERMISSION_LABELS: Record<string, string> = {
    "referral:create": "Create referrals",
    "referral:read:own-facility": "Read referrals involving your facility",
    "referral:read:cross-facility": "Read referrals across all facilities",
    "referral:route": "Route referrals to a receiving facility",
    "referral:triage": "Triage and acknowledge inbound referrals",
    "referral:accept": "Accept, schedule or decline a referral",
    "referral:request-info": "Request more information from the referrer",
    "referral:complete": "Record outcomes and close referrals",
    "referral:feedback": "Send and acknowledge feedback",
    "referral:cancel": "Cancel referrals",
    "patient:create": "Register patients",
    "patient:read": "Read the patient registry",
    "patient:update": "Update patient demographics",
    "attachment:add": "Attach clinical documents",
    "attachment:read": "View attached clinical documents",
    "attachment:purge": "Purge attachments under retention policy",
    "consent:record": "Record consent and lawful basis",
    "consent:read": "Read consent records",
    "consent:revoke": "Revoke consent",
    "fhir:read": "Read the FHIR exchange layer",
    "fhir:write": "Write to the FHIR store",
    "fhir:validate": "Run FHIR and PH Core validation",
    "fhir:map": "View data mappings",
    "audit:read": "Read the audit trail",
    "audit:export": "Export the audit trail",
    "access-request:create": "Submit an access request",
    "access-request:decide": "Decide access requests",
    "retention:manage": "Manage retention policy",
    "directory:manage": "Manage the facility directory",
    "user:manage": "Manage user accounts",
    "config:manage": "Change system configuration",
    "report:view": "View process reports",
    "patient:status-view": "View referral status as a patient",
  };

  return (
    <>
      <PageHeader
        title="Your account"
        subtitle="Your role, the permissions it carries, your active sessions, and your own recent activity."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* ---------------- Identity ---------------- */}
        <div className="space-y-5">
          <Card title="Identity" divided>
            <dl className="space-y-3.5">
              <Fact label="Full name">{user?.full_name ?? session.fullName}</Fact>
              <Fact label="Email">{user?.email ?? session.email}</Fact>
              <Fact label="Role">{ROLE_LABELS[session.role]}</Fact>
              {user?.specialization && <Fact label="Specialisation">{user.specialization}</Fact>}
              {user?.prc_license && <Fact label="PRC licence" mono>{user.prc_license}</Fact>}
              {user?.phone && <Fact label="Contact number">{user.phone}</Fact>}
              <Fact label="Account created">
                {formatDateTime(user?.created_at)}
                {user?.last_login_at && (
                  <span className="mt-0.5 block text-ink-500">
                    Last signed in {relativeTime(user.last_login_at)}
                  </span>
                )}
              </Fact>
            </dl>
          </Card>

          {facility && (
            <Card title="Your facility" divided>
              <dl className="space-y-3.5">
                <Fact label="Name">{facility.name}</Fact>
                <Fact label="Level">
                  <span className="capitalize">{facility.level ?? "Not recorded"}</span>
                  {facility.ownership ? ` · ${facility.ownership}` : ""}
                </Fact>
                {facility.city_display && <Fact label="City">{facility.city_display}</Fact>}
                <Fact label="Registry identifiers" mono>
                  {facility.nhfr_code ? `NHFR ${maskId(facility.nhfr_code)}` : "No NHFR code"}
                  {facility.hcpn_code && <span className="mt-0.5 block">HCPN {facility.hcpn_code}</span>}
                  {facility.philhealth_pan && <span className="mt-0.5 block">PAN {maskId(facility.philhealth_pan)}</span>}
                </Fact>
              </dl>
              <p className="mt-3 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
                These identifiers are published in the FHIR Organization resource so other facilities can address yours
                unambiguously.
              </p>
            </Card>
          )}
        </div>

        {/* ---------------- Access ---------------- */}
        <div className="space-y-5">
          <Card
            title="What your role can do"
            description={`${permissions.length} permissions granted by the ${ROLE_LABELS[session.role]} role`}
            divided
          >
            <ul className="space-y-2">
              {permissions.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="text-[12.5px] leading-snug text-ink-700">{PERMISSION_LABELS[p] ?? p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3.5 border-t border-ink-200/80 pt-3 text-[10.5px] leading-relaxed text-ink-400">
              Access is least-privilege and facility-scoped: you can act on a referral only where your facility is the
              referrer or the receiver. Requests for cross-facility access are reviewed by an administrator.
            </p>
          </Card>

          <Card
            title="Active sessions"
            description={`${sessions.filter((s) => !s.revoked_at).length} signed in`}
            divided
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-ink-100">
              {sessions.map((s) => {
                const revoked = !!s.revoked_at;
                const expired = new Date(s.expires_at) < new Date();
                return (
                  <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                    <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink-800">
                        {s.id === session.sessionId ? "This session" : "Another session"}
                        {revoked ? " · signed out" : expired ? " · expired" : " · active"}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-500">
                        Started {formatDateTime(s.created_at)} · expires {formatDateTime(s.expires_at)}
                      </p>
                      {s.ip_address && <p className="mono-id">{s.ip_address}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Your recent activity" divided bodyClassName="p-0">
            <ul className="divide-y divide-ink-100">
              {myActivity.map((a, i) => (
                <li key={i} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        a.outcome === "0" ? "bg-brand-500" : "bg-red-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-snug text-ink-700">{a.description}</p>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        {a.event_type} · {formatDateTime(a.occurred_at)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
              {myActivity.length === 0 && (
                <li className="px-4 py-4 text-[12px] text-ink-500">No recorded activity yet.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      <Alert tone="neutral" className="mt-5" title="This is a demonstration account">
        <p>
          Your credentials, facility and patient records in this environment are synthetic. Nothing here is connected to
          a live health information system. The application still enforces its access controls in full so that the
          controls themselves can be evaluated.
        </p>
        <p className="mt-2">
          Validation targets the {PHCORE_IG.name} <span className="font-mono">v{PHCORE_IG.version}</span>, treated as an
          alignment reference because the national guide is still in draft.
        </p>
      </Alert>
    </>
  );
}

void Link;
void IconShield;
void IconKey;
void IconExternal;
