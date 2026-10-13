import { notFound, redirect } from "next/navigation";
import { getSession, PERMISSIONS, hasPermission } from "@/lib/auth";
import { getReferralDetail, viewerSide, assertCanView } from "@/lib/referrals";
import { STATES, type ReferralState } from "@/lib/workflow";
import { computeAge, formatDateTime, formatDateLong } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Printable referral summary.
 *
 * Renders as a conventional referral letter. This is the fallback path that
 * matters in practice: not every receiving facility will read a FHIR bundle, so
 * the exchange has to degrade to a document a clinician can read and fax.
 */
export default async function PrintReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  if (!hasPermission(session, PERMISSIONS.REFERRAL_READ_OWN_FACILITY)) redirect("/dashboard");

  const detail = getReferralDetail(id);
  if (!detail) notFound();

  const access = assertCanView(session, detail);
  if (!access.ok) redirect("/referrals");

  const side = viewerSide(session, detail);
  const state = STATES[detail.status as ReferralState];
  const patientName = `${detail.patient.given_name} ${detail.patient.middle_name ?? ""} ${detail.patient.family_name}`.replace(/\s+/g, " ");

  return (
    <div className="mx-auto max-w-[46rem] bg-white px-8 py-8 text-ink-900 print:px-0 print:py-0">
      {/* ---------------- Header ---------------- */}
      <header className="mb-7 flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">HealthLink</p>
          <p className="text-[11px] text-ink-600">Interoperable Patient Referral and Health Information Exchange</p>
          <p className="mt-1.5 font-mono text-[12px] font-medium">{detail.referral_number}</p>
          <p className="text-[11px] text-ink-600">
            Status at printing: {state?.label ?? detail.status}
            {detail.priority !== "routine" ? ` · ${detail.priority.toUpperCase()}` : ""}
          </p>
        </div>
        <div className="text-right text-[11px] leading-relaxed text-ink-600">
          <p className="font-medium text-ink-900">Printed</p>
          <p>{formatDateTime(new Date().toISOString())}</p>
          <p className="mt-1.5 font-medium text-ink-900">Patient tracking code</p>
          <p className="font-mono text-[12px]">{detail.tracking_code}</p>
        </div>
      </header>

      {/* ---------------- Parties ---------------- */}
      <section className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">
            Referred by
          </p>
          <p className="text-[13px] font-medium">{detail.referringFacility.name}</p>
          {detail.referringUser && (
            <>
              <p className="text-[12px]">{detail.referringUser.full_name}</p>
              {detail.referringUser.specialization && (
                <p className="text-[11px] text-ink-600">{detail.referringUser.specialization}</p>
              )}
              {detail.referringUser.prc_license && (
                <p className="text-[11px] text-ink-600">PRC {detail.referringUser.prc_license}</p>
              )}
            </>
          )}
          <p className="mt-1 text-[11px] text-ink-600">
            {[detail.referringFacility.address_line, detail.referringFacility.barangay_display, detail.referringFacility.city_display]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="text-[11px] text-ink-600">{formatDateTime(detail.created_at)}</p>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">
            Referred to
          </p>
          <p className="text-[13px] font-medium">{detail.receivingFacility.name}</p>
          {detail.receivingUser && (
            <>
              <p className="text-[12px]">{detail.receivingUser.full_name}</p>
              {detail.receivingUser.specialization && (
                <p className="text-[11px] text-ink-600">{detail.receivingUser.specialization}</p>
              )}
            </>
          )}
          <p className="mt-1 text-[11px] text-ink-600">
            {[detail.receivingFacility.address_line, detail.receivingFacility.barangay_display, detail.receivingFacility.city_display]
              .filter(Boolean)
              .join(", ")}
          </p>
          {detail.appointment_at && (
            <p className="text-[11px] text-ink-600">Appointment: {formatDateTime(detail.appointment_at)}</p>
          )}
        </div>
      </section>

      {/* ---------------- Patient ---------------- */}
      <section className="mb-6 border-y border-ink-200 py-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">Patient</p>
        <div className="grid grid-cols-3 gap-4 text-[12px]">
          <div className="col-span-2">
            <p className="text-[14px] font-medium">{patientName}</p>
            <p className="text-ink-600">
              {detail.patient.sex === "male" ? "Male" : detail.patient.sex === "female" ? "Female" : detail.patient.sex}
              , {computeAge(detail.patient.birth_date)} · born {formatDateLong(detail.patient.birth_date)}
              {detail.patient.blood_type ? ` · blood type ${detail.patient.blood_type}` : ""}
            </p>
            <p className="mt-1 text-ink-600">
              {[
                detail.patient.address_line,
                detail.patient.barangay_display,
                detail.patient.city_display,
                detail.patient.province_display,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
          <div>
            <p className="text-ink-600">MRN: {detail.patient.local_mrn ?? "—"}</p>
            {detail.patient.philhealth_id && <p className="text-ink-600">PhilHealth: {detail.patient.philhealth_id}</p>}
            {detail.patient.philsys_id && <p className="text-ink-600">PhilSys: {detail.patient.philsys_id}</p>}
            {detail.patient.phone && <p className="text-ink-600">Tel: {detail.patient.phone}</p>}
          </div>
        </div>
      </section>

      {/* ---------------- Safety ---------------- */}
      {detail.allergies.length > 0 && (
        <section className="mb-6 rounded border-2 border-red-600 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-red-700">
            Allergies and intolerances
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {detail.allergies.map((a) => (
              <li key={a.id ?? a.code} className="text-[13px] font-medium text-red-800">
                {a.display}
                {a.reaction ? ` — ${a.reaction}` : ""}
                {a.criticality ? ` (${a.criticality} criticality)` : ""}
                <span className="ml-1.5 font-mono text-[10px] font-normal">{a.code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- Reason ---------------- */}
      <Section title="Reason for referral">
        <p className="font-medium">{detail.reason_display}</p>
        {detail.reason_narrative && <p className="mt-1">{detail.reason_narrative}</p>}
      </Section>

      <Section title="Requested action">
        <p className="font-medium">{detail.requested_action?.trim() || "Not recorded"}</p>
      </Section>

      {/* ---------------- Diagnoses ---------------- */}
      {detail.diagnoses.length > 0 && (
        <Section title="Diagnoses">
          <ul className="space-y-0.5">
            {detail.diagnoses.map((d) => (
              <li key={d.id ?? d.code}>
                <span className="font-medium capitalize">{d.role}:</span> {d.display}
                <span className="ml-1 font-mono text-[10px] text-ink-600">
                  [{d.system.includes("icd") ? "ICD-10" : "SNOMED"} {d.code}]
                </span>
                <span className="text-ink-600"> — {d.certainty ?? "confirmed"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------- Vitals ---------------- */}
      {(detail.vital_systolic != null ||
        detail.vital_heart_rate != null ||
        detail.vital_temperature != null ||
        detail.vital_spo2 != null) && (
        <Section title="Vital signs at referral">
          <p className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
            {detail.vital_systolic != null && detail.vital_diastolic != null && (
              <span>
                BP {detail.vital_systolic}/{detail.vital_diastolic} mmHg
              </span>
            )}
            {detail.vital_heart_rate != null && <span>HR {detail.vital_heart_rate} bpm</span>}
            {detail.vital_resp_rate != null && <span>RR {detail.vital_resp_rate}/min</span>}
            {detail.vital_temperature != null && <span>T {detail.vital_temperature}°C</span>}
            {detail.vital_spo2 != null && <span>SpO₂ {detail.vital_spo2}%</span>}
            {detail.vital_weight_kg != null && <span>Wt {detail.vital_weight_kg} kg</span>}
            {detail.vital_height_cm != null && <span>Ht {detail.vital_height_cm} cm</span>}
            {detail.vital_pain_score != null && <span>Pain {detail.vital_pain_score}/10</span>}
          </p>
        </Section>
      )}

      {/* ---------------- Narrative ---------------- */}
      {(
        [
          ["Chief complaint", detail.chief_complaint],
          ["History of present illness", detail.history_of_present],
          ["Past medical history", detail.past_medical_history],
          ["Past surgical history", detail.past_surgical_history],
          ["Family history", detail.family_history],
          ["Personal and social history", detail.personal_social_history],
          ["Review of systems", detail.review_of_systems],
          ["Physical examination", detail.physical_examination],
          ["Assessment", detail.assessment],
          ["Management to date", detail.management_plan],
        ] as const
      )
        .filter(([, v]) => !!v?.trim())
        .map(([label, value]) => (
          <Section key={label} title={label}>
            <p className="whitespace-pre-wrap">{value}</p>
          </Section>
        ))}

      {/* ---------------- Results ---------------- */}
      {detail.observations.length > 0 && (
        <Section title="Observations and results">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-ink-300 text-left">
                <th className="py-1 font-semibold">Observation</th>
                <th className="py-1 font-semibold">Result</th>
                <th className="py-1 font-semibold">Reference</th>
                <th className="py-1 font-semibold">Code</th>
              </tr>
            </thead>
            <tbody>
              {detail.observations.map((o) => (
                <tr key={o.id ?? o.code} className="border-b border-ink-100">
                  <td className="py-1 pr-3">{o.display}</td>
                  <td className="py-1 pr-3 font-medium">
                    {o.value_num != null ? `${o.value_num}${o.unit ? ` ${o.unit}` : ""}` : (o.value_text ?? "—")}
                  </td>
                  <td className="py-1 pr-3 text-ink-600">
                    {o.ref_low != null || o.ref_high != null
                      ? `${o.ref_low ?? ""}${o.ref_low != null && o.ref_high != null ? "–" : ""}${o.ref_high ?? ""}`
                      : "—"}
                  </td>
                  <td className="py-1 font-mono text-[10px] text-ink-600">{o.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ---------------- Medications ---------------- */}
      {detail.medications.length > 0 && (
        <Section title="Current medications">
          <ul className="space-y-0.5">
            {detail.medications.map((m) => (
              <li key={m.id ?? m.medication}>
                <span className="font-medium">{m.medication}</span>
                {m.dose ? ` — ${m.dose}` : ""}
                {m.route ? `, ${m.route}` : ""}
                {m.frequency ? `, ${m.frequency}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------- Feedback ---------------- */}
      {detail.messages.length > 0 && (
        <Section title="Feedback and communication">
          <ul className="space-y-3">
            {detail.messages.map((m) => (
              <li key={m.id} className="border-l-2 border-ink-300 pl-3">
                <p className="text-[11px] text-ink-600">
                  <span className="font-medium text-ink-900">{m.sender_name ?? "HealthLink"}</span> ·{" "}
                  {formatDateTime(m.created_at)} · {m.kind.replace(/-/g, " ")}
                </p>
                {m.subject && <p className="mt-0.5 font-medium">{m.subject}</p>}
                <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------- Outcome ---------------- */}
      {detail.outcome_display && (
        <Section title="Outcome at the receiving facility">
          <p className="font-medium">{detail.outcome_display}</p>
          {detail.receiving_notes && <p className="mt-1 whitespace-pre-wrap">{detail.receiving_notes}</p>}
        </Section>
      )}

      {/* ---------------- Footer ---------------- */}
      <footer className="mt-8 border-t border-ink-300 pt-4 text-[10px] leading-relaxed text-ink-600">
        <p>
          <span className="font-medium">Consent and lawful basis:</span> {detail.lawful_basis_display}
          {detail.consent ? ` — authorisation recorded ${formatDateTime(detail.consent.granted_at)}` : ""}
        </p>
        <p className="mt-1">
          <span className="font-medium">Confidentiality:</span> {detail.confidentiality_level} ·{" "}
          <span className="font-medium">Signed in as:</span> {session.fullName} ({side}) ·{" "}
          <span className="font-medium">FHIR bundle version:</span> v{detail.fhir_bundle_version}
        </p>
        <p className="mt-2">
          This document contains sensitive personal information protected under the Data Privacy Act of 2012 (RA
          10173). Handle, store and dispose of it accordingly. HealthLink is a concept prototype and the data in this
          environment is synthetic.
        </p>
      </footer>

      <p className="mt-4 text-center text-[10px] text-ink-400 no-print">
        Use your browser&rsquo;s print function (Ctrl/Cmd + P) to produce a paper or PDF copy.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">{title}</h2>
      <div className="text-[12.5px] leading-[1.65]">{children}</div>
    </section>
  );
}
