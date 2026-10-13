import Link from "next/link";
import { Card, ClinicalField, formatDate, formatNum } from "@/components/ui";
import { LOINC, ICD10, SNOMED, CS } from "@/lib/fhir/terminology";
import { IconAlert, IconPulse } from "@/components/icons";
import type { ReferralDetail } from "@/lib/referrals";

/**
 * The clinical summary exactly as the receiving provider reads it.
 *
 * Sections mirror a conventional referral letter so the information
 * architecture is familiar. Safety-critical content (allergies, restrictions)
 * is hoisted above everything else.
 */
export function ClinicalSummary({ detail }: { detail: ReferralDetail }) {
  const showVitals = [
    detail.vital_systolic,
    detail.vital_diastolic,
    detail.vital_heart_rate,
    detail.vital_resp_rate,
    detail.vital_temperature,
    detail.vital_spo2,
    detail.vital_weight_kg,
    detail.vital_height_cm,
  ].some((v) => v != null);

  const bmi = computeBmi(detail.vital_weight_kg, detail.vital_height_cm);

  return (
    <div className="space-y-4">
      {/* ---------------- Safety-critical ---------------- */}
      {(detail.allergies.length > 0 || detail.confidentiality_level !== "normal") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {detail.allergies.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-red-700">
                <IconAlert className="h-3.5 w-3.5" />
                Allergies and intolerances
              </p>
              <ul className="mt-2 space-y-1.5">
                {detail.allergies.map((a) => (
                  <li key={a.id ?? a.code} className="text-[13px] leading-snug text-red-900">
                    <span className="font-medium">{a.display}</span>
                    {a.reaction ? <span className="text-red-800"> — {a.reaction}</span> : null}
                    <span className="mt-0.5 block">
                      <span className="mono-id text-red-700/80">
                        {a.system.includes("snomed") ? "SNOMED" : "code"} {a.code}
                      </span>
                      {a.criticality ? (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">
                          {a.criticality === "high" ? "high risk" : a.criticality}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.confidentiality_level !== "normal" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800">
                {detail.confidentiality_level === "highly-restricted" ? "Highly restricted" : "Restricted record"}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900">
                {detail.confidentiality_level === "highly-restricted"
                  ? "Consent has been withdrawn or a restriction applies. Exchange is disabled and access is limited to the patient's own care team."
                  : "Sensitive information. Share only with authorised users directly involved in this patient's care."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- The request ---------------- */}
      <Card
        title="Referral request"
        actions={
          <span className="mono-id hidden sm:block">
            {CS.HL_LOCAL}#{detail.reason_code}
          </span>
        }
        divided
      >
        <div className="mb-3.5 rounded-xl bg-ink-50 px-3.5 py-3">
          <p className="section-label">Reason for referral</p>
          <p className="mt-1 text-[14px] font-medium text-ink-900">{detail.reason_display}</p>
        </div>
        {detail.reason_narrative && (
          <p className="mb-4 text-[14px] leading-[1.7] text-ink-700">{detail.reason_narrative}</p>
        )}
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-800">
            Requested action
          </p>
          <p className="mt-1 text-[14px] leading-[1.7] text-ink-900">
            {detail.requested_action?.trim() || "Not recorded"}
          </p>
        </div>
        {detail.special_instructions?.trim() && (
          <div className="mt-3">
            <p className="section-label mb-1">Special instructions</p>
            <p className="text-[13.5px] leading-relaxed text-ink-800">{detail.special_instructions}</p>
          </div>
        )}
      </Card>

      {/* ---------------- Examination ---------------- */}
      <Card title="Examination" divided>
        {showVitals && (
          <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
              <IconPulse className="h-3.5 w-3.5" />
              Vital signs at referral
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {detail.vital_systolic != null && detail.vital_diastolic != null && (
                <Vital label="Blood pressure" value={`${detail.vital_systolic}/${detail.vital_diastolic}`} unit="mmHg" />
              )}
              {detail.vital_heart_rate != null && <Vital label="Heart rate" value={detail.vital_heart_rate} unit="bpm" />}
              {detail.vital_resp_rate != null && <Vital label="Respiratory rate" value={detail.vital_resp_rate} unit="/min" />}
              {detail.vital_temperature != null && <Vital label="Temperature" value={detail.vital_temperature} unit="°C" />}
              {detail.vital_spo2 != null && <Vital label="O₂ saturation" value={detail.vital_spo2} unit="%" />}
              {detail.vital_weight_kg != null && <Vital label="Weight" value={detail.vital_weight_kg} unit="kg" />}
              {detail.vital_height_cm != null && <Vital label="Height" value={detail.vital_height_cm} unit="cm" />}
              {bmi != null && <Vital label="BMI" value={bmi} unit="kg/m²" />}
              {detail.vital_pain_score != null && <Vital label="Pain score" value={`${detail.vital_pain_score}/10`} />}
            </div>
          </div>
        )}
        <dl className="dl-clinical">
          <ClinicalField label="Physical examination" value={detail.physical_examination} />
        </dl>
      </Card>

      {/* ---------------- Narrative ---------------- */}
      <Card title="History" divided>
        <dl className="dl-clinical">
          <ClinicalField label="Chief complaint" value={detail.chief_complaint} />
          <ClinicalField label="History of present illness" value={detail.history_of_present} />
          <ClinicalField label="Past medical history" value={detail.past_medical_history} />
          <ClinicalField label="Past surgical history" value={detail.past_surgical_history} />
          <ClinicalField label="Family history" value={detail.family_history} />
          <ClinicalField label="Personal and social history" value={detail.personal_social_history} />
          <ClinicalField label="Review of systems" value={detail.review_of_systems} />
        </dl>
      </Card>

      {/* ---------------- Assessment & plan ---------------- */}
      <Card title="Assessment and management" divided>
        <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
          <p className="section-label mb-1">Assessment</p>
          <p className="text-[14px] leading-[1.7] text-ink-900">{detail.assessment?.trim() || "Not recorded"}</p>
        </div>
        <dl className="dl-clinical">
          <ClinicalField label="Management to date" value={detail.management_plan} />
        </dl>
      </Card>

      {/* ---------------- Diagnoses ---------------- */}
      <Card
        title="Diagnoses"
        description={`${detail.diagnoses.length} recorded`}
        divided
        bodyClassName="p-0"
      >
        {detail.diagnoses.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-500">No coded diagnoses recorded.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {detail.diagnoses.map((d) => {
              const isIcd = d.system.includes("icd");
              const isSnomed = d.system.includes("snomed");
              return (
                <li key={d.id ?? d.code} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 shrink-0 ${
                      d.role === "primary" ? "chip-positive" : d.role === "differential" ? "chip-warn" : "chip-neutral"
                    }`}
                  >
                    {d.role === "primary" ? "Primary" : d.role === "differential" ? "Differential" : "Secondary"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-snug text-ink-900">{d.display}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-ink-500">
                      <span className="font-mono">
                        {isIcd ? "ICD-10" : isSnomed ? "SNOMED CT" : "code"} {d.code}
                      </span>
                      {isIcd && ICD10[d.code] && <span>Chapter {ICD10[d.code].chapter}</span>}
                      <span className="capitalize">{d.certainty ?? "confirmed"}</span>
                      {d.onset_date && <span>onset {formatDate(d.onset_date)}</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------------- Results ---------------- */}
      <Card
        title="Observations and results"
        description={detail.observations.length ? `${detail.observations.length} attached, LOINC coded` : undefined}
        divided
        bodyClassName="p-0"
      >
        {detail.observations.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-500">No observations attached.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-head w-[9rem]">Category</th>
                  <th className="table-head">Observation</th>
                  <th className="table-head w-[10rem]">Result</th>
                  <th className="table-head w-[9rem]">Reference</th>
                  <th className="table-head w-[7rem]">LOINC</th>
                </tr>
              </thead>
              <tbody>
                {detail.observations.map((o) => {
                  const interp = interpret(o.value_num, o.ref_low, o.ref_high, o.unit);
                  return (
                    <tr key={o.id ?? o.code}>
                      <td className="table-cell">
                        <span className="chip-neutral capitalize">{o.category.replace("-", " ")}</span>
                      </td>
                      <td className="table-cell text-[13px] leading-snug text-ink-800">{o.display}</td>
                      <td className="table-cell">
                        <span className={`text-[13.5px] font-medium tabular-nums ${interp.tone}`}>
                          {o.value_num != null ? formatNum(o.value_num) : (o.value_text ?? "—")}
                          {o.value_num != null && o.unit ? (
                            <span className="ml-1 text-[10.5px] font-normal text-ink-400">{o.unit}</span>
                          ) : null}
                        </span>
                        {interp.label && (
                          <span className={`ml-2 text-[10px] font-semibold uppercase ${interp.tone}`}>
                            {interp.label}
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-[11px] text-ink-500">
                        {o.ref_low != null || o.ref_high != null
                          ? `${o.ref_low ?? ""}${o.ref_low != null && o.ref_high != null ? " – " : ""}${o.ref_high ?? ""} ${o.unit ?? ""}`
                          : "—"}
                      </td>
                      <td className="table-cell">
                        <span className="mono-id">{o.code}</span>
                        {LOINC[o.code] && <span className="block text-[10px] text-ink-400">LOINC</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- Medications ---------------- */}
      <Card
        title="Medications"
        description={detail.medications.length ? `${detail.medications.length} recorded` : undefined}
        divided
        bodyClassName="p-0"
      >
        {detail.medications.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-500">No medications recorded.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {detail.medications.map((m) => (
              <li key={m.id ?? m.medication} className="flex items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-snug text-ink-900">{m.medication}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-500">
                    {m.dose && <span>{m.dose}</span>}
                    {m.route && <span>{m.route}</span>}
                    {m.frequency && <span>{m.frequency}</span>}
                    {m.started_on && <span>since {formatDate(m.started_on)}</span>}
                  </span>
                </span>
                {m.fda_cpr && <span className="mono-id shrink-0">FDA {m.fda_cpr}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------- Provenance hint ---------------- */}
      <p className="px-1 text-[10.5px] leading-relaxed text-ink-400">
        This summary is exchanged as a FHIR R4 transaction bundle aligned to the draft Philippine Core profiles.{" "}
        <Link href={`/interop/alignment`} className="link no-print">
          See the mapping
        </Link>
        .
      </p>
    </div>
  );
}

function Vital({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-ink-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums leading-none text-ink-900">
        {typeof value === "number" ? formatNum(value) : value}
        {unit ? <span className="ml-1 text-[10.5px] font-normal text-ink-400">{unit}</span> : null}
      </p>
    </div>
  );
}

function computeBmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

/** Display-only interpretation; the authoritative value sits on the FHIR Observation. */
function interpret(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string | null | undefined,
): { label: string; tone: string } {
  if (value == null || (low == null && high == null)) return { label: "", tone: "text-ink-900" };
  const isCriticalHigh = high != null && value >= high * 2;
  const isCriticalLow = low != null && value <= low / 2 && unit !== "%";
  if (high != null && value > high) {
    return isCriticalHigh
      ? { label: "critical high", tone: "text-red-700" }
      : { label: "high", tone: "text-amber-700" };
  }
  if (low != null && value < low) {
    return isCriticalLow ? { label: "critical low", tone: "text-red-700" } : { label: "low", tone: "text-amber-700" };
  }
  return { label: "normal", tone: "text-brand-700" };
}

void SNOMED;
