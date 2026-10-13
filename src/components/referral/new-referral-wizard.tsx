"use client";

import { useActionState, useMemo, useState, useCallback } from "react";
import { createReferralAction, type CreateReferralState } from "@/app/actions/referrals";
import { Alert, SectionHeading, Fact, computeAge } from "@/components/ui";
import {
  IconCheck,
  IconAlert,
  IconArrowRight,
  IconArrowLeft,
  IconPlus,
  IconSearch,
  IconClose,
  IconUserCircle,
  IconBuilding,
  IconClipboard,
  IconCode,
  IconShield,
  IconActivity,
} from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Option {
  code: string;
  display: string;
  extra?: string;
}

export interface PatientOption {
  id: string;
  fullName: string;
  mrn: string | null;
  philhealth: string | null;
  sex: string;
  birthDate: string;
  barangay: string | null;
  phone: string | null;
}

export interface FacilityOption {
  id: string;
  name: string;
  shortName: string | null;
  level: string | null;
  ownership: string | null;
  city: string | null;
  services: string[];
}

export interface CodedOption {
  code: string;
  display: string;
  group?: string;
}

export interface PresetObservation {
  system: string;
  code: string;
  display: string;
  category: string;
  valueNum: string;
  valueText: string;
  unit: string;
  ucum: string;
  refLow: string;
  refHigh: string;
}

interface ReferralFormState {
  patientId: string;
  receivingFacilityId: string;
  priority: string;
  reasonCode: string;
  reasonNarrative: string;
  chiefComplaint: string;
  historyOfPresent: string;
  pastMedicalHistory: string;
  pastSurgicalHistory: string;
  familyHistory: string;
  personalSocialHistory: string;
  reviewOfSystems: string;
  physicalExamination: string;
  assessment: string;
  managementPlan: string;
  requestedAction: string;
  specialInstructions: string;
  vitalSystolic: string;
  vitalDiastolic: string;
  vitalHeartRate: string;
  vitalRespRate: string;
  vitalTemperature: string;
  vitalSpo2: string;
  vitalWeightKg: string;
  vitalHeightCm: string;
  vitalPainScore: string;
  lawfulBasisCode: string;
  confidentialityLevel: string;
  dataMinimisationNote: string;
  consentName: string;
  consentRelation: string;
  consentWitness: string;
  consentPeriodEnd: string;
  routeImmediately: boolean;
}

interface DiagnosisDraft {
  key: number;
  system: string;
  code: string;
  display: string;
  role: string;
  certainty: string;
}

interface ObservationDraft {
  key: number;
  system: string;
  code: string;
  display: string;
  category: string;
  valueNum: string;
  valueText: string;
  unit: string;
  ucum: string;
  refLow: string;
  refHigh: string;
}

interface MedicationDraft {
  key: number;
  medication: string;
  dose: string;
  route: string;
  frequency: string;
}

interface AllergyDraft {
  key: number;
  system: string;
  code: string;
  display: string;
  reaction: string;
  criticality: string;
  category: string;
}

const EMPTY: ReferralFormState = {
  patientId: "",
  receivingFacilityId: "",
  priority: "routine",
  reasonCode: "",
  reasonNarrative: "",
  chiefComplaint: "",
  historyOfPresent: "",
  pastMedicalHistory: "",
  pastSurgicalHistory: "",
  familyHistory: "",
  personalSocialHistory: "",
  reviewOfSystems: "",
  physicalExamination: "",
  assessment: "",
  managementPlan: "",
  requestedAction: "",
  specialInstructions: "",
  vitalSystolic: "",
  vitalDiastolic: "",
  vitalHeartRate: "",
  vitalRespRate: "",
  vitalTemperature: "",
  vitalSpo2: "",
  vitalWeightKg: "",
  vitalHeightCm: "",
  vitalPainScore: "",
  lawfulBasisCode: "treatment-purpose",
  confidentialityLevel: "normal",
  dataMinimisationNote: "Minimum necessary data set for referral review.",
  consentName: "",
  consentRelation: "self",
  consentWitness: "",
  consentPeriodEnd: "",
  routeImmediately: true,
};

const STEPS = [
  { id: "patient", label: "Patient", icon: IconUserCircle },
  { id: "referral", label: "Referral", icon: IconBuilding },
  { id: "clinical", label: "Clinical summary", icon: IconClipboard },
  { id: "codes", label: "Diagnoses and results", icon: IconCode },
  { id: "privacy", label: "Consent", icon: IconShield },
  { id: "review", label: "Review and send", icon: IconActivity },
] as const;

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

export function NewReferralWizard({
  patients,
  facilities,
  icd10,
  snomed,
  loinc,
  lawfulBases,
  reasonCodes,
  presets,
  defaultFacilityId,
}: {
  patients: PatientOption[];
  facilities: FacilityOption[];
  icd10: CodedOption[];
  snomed: CodedOption[];
  loinc: CodedOption[];
  lawfulBases: Array<{ code: string; display: string; legalRef: string; requiresConsentRecord: boolean; note: string }>;
  reasonCodes: Option[];
  presets: { vitals: PresetObservation[]; observations: PresetObservation[] };
  defaultFacilityId: string;
}) {
  const [state, formAction, pending] = useActionState<CreateReferralState, FormData>(createReferralAction, {});
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ReferralFormState>({ ...EMPTY, receivingFacilityId: defaultFacilityId });
  const [diagnoses, setDiagnoses] = useState<DiagnosisDraft[]>([]);
  const [observations, setObservations] = useState<ObservationDraft[]>([]);
  const [medications, setMedications] = useState<MedicationDraft[]>([]);
  const [allergies, setAllergies] = useState<AllergyDraft[]>([]);
  const [localError, setLocalError] = useState<string | undefined>();

  const set = useCallback(<K extends keyof ReferralFormState>(key: K, value: ReferralFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const patient = patients.find((p) => p.id === form.patientId);
  const facility = facilities.find((f) => f.id === form.receivingFacilityId);
  const step = STEPS[stepIndex];
  const errors = state.fieldErrors ?? {};

  // If the server bounced us back, land on the step that needs attention.
  useMemo(() => {
    if (state.fieldErrors && state.step) {
      const idx = STEPS.findIndex((s) => s.id === state.step);
      if (idx >= 0) setStepIndex(idx);
    }
  }, [state.fieldErrors, state.step]);

  /* ---------------- Step readiness ---------------- */

  const blocking = (): string | undefined => {
    switch (step.id) {
      case "patient":
        return form.patientId ? undefined : "Select the patient being referred.";
      case "referral":
        if (!form.receivingFacilityId) return "Select the receiving facility.";
        if (!form.reasonCode) return "Choose a reason for referral.";
        if (form.reasonCode === "other" && !form.reasonNarrative.trim())
          return "Describe the reason for referral.";
        return undefined;
      case "clinical":
        if (!form.chiefComplaint.trim()) return "Record the chief complaint.";
        if (!form.assessment.trim()) return "Record your clinical assessment.";
        if (!form.requestedAction.trim()) return "State the action you are requesting.";
        return undefined;
      case "codes":
        return diagnoses.some((d) => d.code) ? undefined : "Add at least one coded diagnosis.";
      case "privacy": {
        if (!form.lawfulBasisCode) return "Select the lawful basis for this exchange.";
        const basis = lawfulBases.find((b) => b.code === form.lawfulBasisCode);
        if (basis?.requiresConsentRecord && !form.consentName.trim())
          return "Record who authorised this exchange.";
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const advance = () => {
    const reason = blocking();
    if (reason) return setLocalError(reason);
    setLocalError(undefined);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const goTo = (i: number) => {
    setLocalError(undefined);
    setStepIndex(i);
  };

  /* ---------------- Payload ---------------- */

  const payload = useMemo(
    () =>
      JSON.stringify({
        patientId: form.patientId,
        receivingFacilityId: form.receivingFacilityId,
        priority: form.priority,
        reasonCode: form.reasonCode,
        reasonDisplay: reasonCodes.find((r) => r.code === form.reasonCode)?.display ?? form.reasonCode,
        reasonNarrative: form.reasonNarrative || undefined,
        chiefComplaint: form.chiefComplaint,
        historyOfPresent: form.historyOfPresent,
        pastMedicalHistory: form.pastMedicalHistory,
        pastSurgicalHistory: form.pastSurgicalHistory,
        familyHistory: form.familyHistory,
        personalSocialHistory: form.personalSocialHistory,
        reviewOfSystems: form.reviewOfSystems,
        physicalExamination: form.physicalExamination,
        assessment: form.assessment,
        managementPlan: form.managementPlan,
        requestedAction: form.requestedAction,
        specialInstructions: form.specialInstructions,
        vitals: {
          systolic: numOrUndef(form.vitalSystolic),
          diastolic: numOrUndef(form.vitalDiastolic),
          heartRate: numOrUndef(form.vitalHeartRate),
          respRate: numOrUndef(form.vitalRespRate),
          temperature: numOrUndef(form.vitalTemperature),
          spo2: numOrUndef(form.vitalSpo2),
          weightKg: numOrUndef(form.vitalWeightKg),
          heightCm: numOrUndef(form.vitalHeightCm),
          painScore: numOrUndef(form.vitalPainScore),
        },
        lawfulBasisCode: form.lawfulBasisCode,
        confidentialityLevel: form.confidentialityLevel,
        dataMinimisationNote: form.dataMinimisationNote,
        consent:
          lawfulBases.find((b) => b.code === form.lawfulBasisCode)?.requiresConsentRecord && form.consentName
            ? {
                grantedByName: form.consentName,
                grantedByRelation: form.consentRelation,
                witnessName: form.consentWitness || undefined,
                periodEnd: form.consentPeriodEnd ? new Date(form.consentPeriodEnd).toISOString() : undefined,
              }
            : undefined,
        diagnoses: diagnoses
          .filter((d) => d.code)
          .map((d) => ({
            system: d.system,
            code: d.code,
            display: d.display,
            role: d.role,
            certainty: d.certainty,
          })),
        observations: observations
          .filter((o) => o.code)
          .map((o) => ({
            system: o.system,
            code: o.code,
            display: o.display,
            category: o.category,
            valueNum: numOrUndef(o.valueNum),
            valueText: o.valueText || undefined,
            unit: o.unit || undefined,
            ucum: o.ucum || undefined,
            refLow: numOrUndef(o.refLow),
            refHigh: numOrUndef(o.refHigh),
          })),
        medications: medications
          .filter((m) => m.medication)
          .map((m) => ({
            medication: m.medication,
            dose: m.dose || undefined,
            route: m.route || undefined,
            frequency: m.frequency || undefined,
          })),
        allergies: allergies
          .filter((a) => a.code)
          .map((a) => ({
            system: a.system,
            code: a.code,
            display: a.display,
            reaction: a.reaction || undefined,
            criticality: a.criticality || undefined,
            category: a.category || undefined,
          })),
        routeImmediately: form.routeImmediately,
      }),
    [form, diagnoses, observations, medications, allergies, reasonCodes, lawfulBases],
  );

  /* ---------------- Render ---------------- */

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      {state.error && (
        <Alert tone="critical" title="The referral was not submitted">
          <p className="whitespace-pre-line">{state.error}</p>
        </Alert>
      )}
      {localError && <Alert tone="warn">{localError}</Alert>}

      {/* ---------------- Step rail ---------------- */}
      <nav aria-label="Referral sections" className="no-print">
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => {
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            const StepIcon = s.icon;
            const hasError = errorForStep(errors, s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                    isActive
                      ? "border-ink-900 bg-ink-900 text-white"
                      : isDone
                        ? "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
                        : "border-ink-200 bg-white text-ink-500 hover:border-ink-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      isActive ? "bg-white/15 text-white" : isDone ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {isDone ? <IconCheck className="h-3 w-3" /> : <StepIcon className="h-3 w-3" />}
                  </span>
                  <span className="whitespace-nowrap text-[12px] font-medium">{s.label}</span>
                  {hasError && (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-red-300" : "bg-red-500"}`} />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="card">
        <div className="px-5 py-5">
          {/* ================= Patient ================= */}
          {step.id === "patient" && (
            <section>
              <SectionHeading
                step={1}
                title="Who is being referred?"
                description="Search the registry. The referral carries the patient's PhilHealth PIN, PhilSys ID and facility MRN so the receiving facility can match them with confidence."
              />
              {patient ? (
                <SelectedPatient patient={patient} onChange={() => set("patientId", "")} />
              ) : (
                <PatientPicker
                  patients={patients}
                  onSelect={(id) => {
                    set("patientId", id);
                    setLocalError(undefined);
                  }}
                />
              )}
            </section>
          )}

          {/* ================= Referral ================= */}
          {step.id === "referral" && (
            <section className="space-y-5">
              <SectionHeading
                step={2}
                title="Where is the patient being referred, and why?"
                description="The receiving facility and the requesting provider need to agree on the purpose before clinical detail matters."
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="receivingFacilityId" className="label">
                    Receiving facility <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="receivingFacilityId"
                    value={form.receivingFacilityId}
                    onChange={(e) => set("receivingFacilityId", e.target.value)}
                    required
                    className="select"
                  >
                    <option value="">Select a facility…</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.level ? ` — ${f.level}` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.receivingFacilityId && <FieldError>{errors.receivingFacilityId}</FieldError>}
                  {facility && (
                    <div className="mt-2.5 rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2.5">
                      <p className="text-[12px] font-medium capitalize text-ink-800">
                        {facility.level ?? "level not recorded"} · {facility.ownership ?? "—"}
                        {facility.city ? ` · ${facility.city}` : ""}
                      </p>
                      {facility.services.length > 0 && (
                        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
                          {facility.services.join(" · ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="reasonCode" className="label">
                      Reason for referral <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="reasonCode"
                      value={form.reasonCode}
                      onChange={(e) => set("reasonCode", e.target.value)}
                      required
                      className="select"
                    >
                      <option value="">Select a reason…</option>
                      {reasonCodes.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.display}
                        </option>
                      ))}
                    </select>
                    {errors.reasonCode && <FieldError>{errors.reasonCode}</FieldError>}
                  </div>

                  <div>
                    <label htmlFor="priority" className="label">
                      Priority
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["routine", "Routine"],
                          ["urgent", "Urgent"],
                          ["asap", "ASAP"],
                          ["stat", "STAT"],
                        ] as const
                      ).map(([code, label]) => {
                        const active = form.priority === code;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => set("priority", code)}
                            disabled={form.reasonCode === "emergency-transfer" && code !== "stat"}
                            className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                              active
                                ? code === "stat"
                                  ? "border-red-300 bg-red-50 text-red-800"
                                  : "border-ink-900 bg-ink-900 text-white"
                                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                            }`}
                            aria-pressed={active}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {form.reasonCode === "emergency-transfer" && (
                      <p className="field-hint font-medium text-red-700">
                        An emergency transfer is always routed as STAT, and relies on the patient&rsquo;s vital interests
                        as its lawful basis.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="reasonNarrative" className="label">
                  Referral narrative {form.reasonCode === "other" && <span className="text-red-600">*</span>}
                </label>
                <textarea
                  id="reasonNarrative"
                  rows={4}
                  value={form.reasonNarrative}
                  onChange={(e) => set("reasonNarrative", e.target.value)}
                  className="textarea"
                  placeholder="In one or two sentences: why does this patient need the receiving facility?"
                />
                {errors.reasonNarrative && <FieldError>{errors.reasonNarrative}</FieldError>}
              </div>

              <div>
                <label htmlFor="requestedAction" className="label">
                  What are you asking the receiving provider to do? <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="requestedAction"
                  rows={5}
                  value={form.requestedAction}
                  onChange={(e) => set("requestedAction", e.target.value)}
                  className="textarea"
                  placeholder="Be specific: “Please assess for insulin initiation and screen for diabetic nephropathy.”"
                />
                {errors.requestedAction && <FieldError>{errors.requestedAction}</FieldError>}
              </div>

              <div>
                <label htmlFor="specialInstructions" className="label">
                  Special instructions for transport or arrival
                </label>
                <textarea
                  id="specialInstructions"
                  rows={3}
                  value={form.specialInstructions}
                  onChange={(e) => set("specialInstructions", e.target.value)}
                  className="textarea"
                  placeholder="e.g. Patient is to fast before arrival. Advised to proceed immediately if symptoms worsen."
                />
              </div>
            </section>
          )}

          {/* ================= Clinical ================= */}
          {step.id === "clinical" && (
            <section className="space-y-5">
              <SectionHeading
                step={3}
                title="What does the receiving provider need to know?"
                description="The receiving provider decides from this page. The more complete the clinical picture, the less likely the referral comes back for missing information."
              />

              {/* Vitals */}
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-900">Vital signs</p>
                    <p className="mt-0.5 text-[10.5px] text-ink-500">
                      Recorded as LOINC-coded Observations with UCUM units, so a receiving system reads them directly.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      set("vitalSystolic", "120");
                      set("vitalDiastolic", "80");
                      set("vitalHeartRate", "88");
                      set("vitalRespRate", "18");
                      set("vitalTemperature", "36.8");
                      set("vitalSpo2", "98");
                      set("vitalPainScore", "0");
                    }}
                  >
                    Fill normal values
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {(
                    [
                      ["vitalSystolic", "Systolic", "mmHg", "1"],
                      ["vitalDiastolic", "Diastolic", "mmHg", "1"],
                      ["vitalHeartRate", "Heart rate", "bpm", "1"],
                      ["vitalRespRate", "Respiratory rate", "/min", "1"],
                      ["vitalTemperature", "Temperature", "°C", "0.1"],
                      ["vitalSpo2", "O₂ saturation", "%", "1"],
                      ["vitalWeightKg", "Weight", "kg", "0.1"],
                      ["vitalHeightCm", "Height", "cm", "0.1"],
                      ["vitalPainScore", "Pain score", "/10", "1"],
                    ] as const
                  ).map(([key, label, unit, stepVal]) => (
                    <div key={key}>
                      <label htmlFor={key} className="label">
                        {label} <span className="font-normal text-ink-400">{unit}</span>
                      </label>
                      <input
                        id={key}
                        type="number"
                        step={stepVal}
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                        className="input tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Narrative
                id="chiefComplaint"
                label="Chief complaint"
                required
                value={form.chiefComplaint}
                onChange={(v) => set("chiefComplaint", v)}
                rows={3}
                placeholder="e.g. Four days of high-grade fever with abdominal pain and vomiting"
                error={errors.chiefComplaint}
              />
              <Narrative
                id="historyOfPresent"
                label="History of present illness"
                value={form.historyOfPresent}
                onChange={(v) => set("historyOfPresent", v)}
                rows={6}
                placeholder="Onset, duration, character, aggravating and relieving factors, associated symptoms, treatment so far."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Narrative id="pastMedicalHistory" label="Past medical history" value={form.pastMedicalHistory} onChange={(v) => set("pastMedicalHistory", v)} rows={4} />
                <Narrative id="pastSurgicalHistory" label="Past surgical history" value={form.pastSurgicalHistory} onChange={(v) => set("pastSurgicalHistory", v)} rows={4} />
                <Narrative id="familyHistory" label="Family history" value={form.familyHistory} onChange={(v) => set("familyHistory", v)} rows={4} />
                <Narrative
                  id="personalSocialHistory"
                  label="Personal and social history"
                  value={form.personalSocialHistory}
                  onChange={(v) => set("personalSocialHistory", v)}
                  rows={4}
                  placeholder="Smoking, alcohol, occupation, living situation, TB contact."
                />
              </div>
              <Narrative id="reviewOfSystems" label="Review of systems" value={form.reviewOfSystems} onChange={(v) => set("reviewOfSystems", v)} rows={4} />
              <Narrative
                id="physicalExamination"
                label="Physical examination"
                value={form.physicalExamination}
                onChange={(v) => set("physicalExamination", v)}
                rows={6}
                placeholder="General survey, then the pertinent positive and negative findings."
              />
              <Narrative
                id="assessment"
                label="Assessment"
                required
                value={form.assessment}
                onChange={(v) => set("assessment", v)}
                rows={5}
                placeholder="Your clinical impression and the reasoning behind it."
                error={errors.assessment}
              />
              <Narrative
                id="managementPlan"
                label="Management given so far"
                value={form.managementPlan}
                onChange={(v) => set("managementPlan", v)}
                rows={5}
                placeholder="Investigations ordered, medication given, monitoring started."
              />
            </section>
          )}

          {/* ================= Codes ================= */}
          {step.id === "codes" && (
            <section className="space-y-6">
              <SectionHeading
                step={4}
                title="Coded clinical detail"
                description="Coded data is what makes the information machine-interpretable at the receiving facility. Free text is carried alongside, never instead."
              />

              {errors.diagnoses && <FieldError>{errors.diagnoses}</FieldError>}

              {/* Diagnoses */}
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink-900">
                      Diagnoses <span className="text-red-600">*</span>
                    </h3>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      ICD-10 or SNOMED CT. At least one is required before the referral can be routed.
                    </p>
                  </div>
                  {diagnoses.length > 0 && (
                    <span className="text-[11px] text-ink-400">
                      {diagnoses.filter((d) => d.role === "primary").length === 0 && "Mark one as primary"}
                    </span>
                  )}
                </div>

                {diagnoses.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {diagnoses.map((d) => (
                      <li key={d.key} className="rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <span className={`mt-0.5 shrink-0 ${d.system === "snomed" ? "chip-info" : "chip-neutral"}`}>
                            {d.system === "snomed" ? "SNOMED CT" : "ICD-10"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-snug text-ink-900">{d.display}</p>
                            <p className="mono-id mt-0.5">{d.code}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDiagnoses((list) => list.filter((x) => x.key !== d.key))}
                            className="btn-icon shrink-0 text-ink-400 hover:text-red-600"
                            aria-label={`Remove ${d.display}`}
                          >
                            <IconClose className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="label" htmlFor={`dx-role-${d.key}`}>
                              Role
                            </label>
                            <select
                              id={`dx-role-${d.key}`}
                              value={d.role}
                              onChange={(e) =>
                                setDiagnoses((list) =>
                                  list.map((x) => (x.key === d.key ? { ...x, role: e.target.value } : x)),
                                )
                              }
                              className="select"
                            >
                              <option value="primary">Primary</option>
                              <option value="secondary">Secondary</option>
                              <option value="differential">Differential</option>
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`dx-cert-${d.key}`}>
                              Certainty
                            </label>
                            <select
                              id={`dx-cert-${d.key}`}
                              value={d.certainty}
                              onChange={(e) =>
                                setDiagnoses((list) =>
                                  list.map((x) => (x.key === d.key ? { ...x, certainty: e.target.value } : x)),
                                )
                              }
                              className="select"
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="provisional">Provisional</option>
                              <option value="differential">Differential</option>
                            </select>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <CodedSearch
                  id="dx-search"
                  title="Search diagnoses"
                  options={[
                    ...icd10.map((o) => ({ ...o, group: "ICD-10" })),
                    ...snomed.map((o) => ({ ...o, group: "SNOMED CT" })),
                  ]}
                  onAdd={(opt) =>
                    setDiagnoses((list) => [
                      ...list,
                      {
                        key: Date.now() + Math.random(),
                        system: opt.group === "SNOMED CT" ? "snomed" : "icd10",
                        code: opt.code,
                        display: opt.display,
                        role: list.length === 0 ? "primary" : "secondary",
                        certainty: "confirmed",
                      },
                    ])
                  }
                  placeholder="Type a term or code, e.g. diabetes or E11.9"
                />
              </div>

              {/* Observations */}
              <div className="border-t border-ink-200/80 pt-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink-900">Observations and results</h3>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      LOINC coded. Values outside the reference range are flagged automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      setObservations((list) => [
                        ...list,
                        ...presets.observations.map((o, i) => ({ ...o, key: Date.now() + i })),
                      ])
                    }
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    Add example results
                  </button>
                </div>

                {observations.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {observations.map((o) => (
                      <li key={o.key} className="rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <span className="mt-0.5 shrink-0 chip-neutral capitalize">
                            {o.category.replace("-", " ")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] leading-snug text-ink-900">{o.display}</p>
                            <p className="mono-id mt-0.5">LOINC {o.code}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setObservations((list) => list.filter((x) => x.key !== o.key))}
                            className="btn-icon shrink-0 text-ink-400 hover:text-red-600"
                            aria-label={`Remove ${o.display}`}
                          >
                            <IconClose className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          {(
                            [
                              ["valueNum", "Value", "numeric"],
                              ["valueText", "Or text", "e.g. Positive"],
                              ["unit", "Unit", "mg/dL"],
                              ["ucum", "UCUM", "mg/dL"],
                              ["refLow", "Ref low", ""],
                              ["refHigh", "Ref high", ""],
                            ] as const
                          ).map(([field, label, ph]) => (
                            <div key={field}>
                              <label className="label" htmlFor={`obs-${field}-${o.key}`}>
                                {label}
                              </label>
                              <input
                                id={`obs-${field}-${o.key}`}
                                value={o[field]}
                                onChange={(e) =>
                                  setObservations((list) =>
                                    list.map((x) => (x.key === o.key ? { ...x, [field]: e.target.value } : x)),
                                  )
                                }
                                className={`input ${field === "ucum" ? "font-mono text-[11px]" : "text-[12px]"}`}
                                placeholder={ph}
                              />
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <CodedSearch
                  id="obs-search"
                  title="Search observations"
                  options={loinc.map((o) => ({ ...o, group: o.group }))}
                  onAdd={(opt) =>
                    setObservations((list) => [
                      ...list,
                      {
                        key: Date.now() + Math.random(),
                        system: "loinc",
                        code: opt.code,
                        display: opt.display,
                        category: opt.group ?? "laboratory",
                        valueNum: "",
                        valueText: "",
                        unit: "",
                        ucum: "",
                        refLow: "",
                        refHigh: "",
                      },
                    ])
                  }
                  placeholder="Type a term or LOINC code"
                />

                {observations.length === 0 && (
                  <p className="mt-3 rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-4 text-center text-[11.5px] text-ink-500">
                    No results attached. The receiving provider will have less objective context, and the referral will
                    carry an advisory finding.
                  </p>
                )}
              </div>

              {/* Medications */}
              <div className="border-t border-ink-200/80 pt-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink-900">Current medications</h3>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      Carried as FHIR MedicationStatement resources.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      setMedications((list) => [
                        ...list,
                        { key: Date.now() + Math.random(), medication: "", dose: "", route: "Oral", frequency: "" },
                      ])
                    }
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
                {medications.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-4 text-center text-[11.5px] text-ink-500">
                    No medications recorded.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {medications.map((m) => (
                      <li key={m.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                        <div className="min-w-[12rem] flex-1">
                          <label className="label" htmlFor={`med-name-${m.key}`}>
                            Medication
                          </label>
                          <input
                            id={`med-name-${m.key}`}
                            value={m.medication}
                            onChange={(e) =>
                              setMedications((list) =>
                                list.map((x) => (x.key === m.key ? { ...x, medication: e.target.value } : x)),
                              )
                            }
                            className="input"
                            placeholder="Medication and strength"
                          />
                        </div>
                        <div className="w-24">
                          <label className="label" htmlFor={`med-dose-${m.key}`}>
                            Dose
                          </label>
                          <input
                            id={`med-dose-${m.key}`}
                            value={m.dose}
                            onChange={(e) =>
                              setMedications((list) =>
                                list.map((x) => (x.key === m.key ? { ...x, dose: e.target.value } : x)),
                              )
                            }
                            className="input"
                          />
                        </div>
                        <div className="w-32">
                          <label className="label" htmlFor={`med-freq-${m.key}`}>
                            Frequency
                          </label>
                          <input
                            id={`med-freq-${m.key}`}
                            value={m.frequency}
                            onChange={(e) =>
                              setMedications((list) =>
                                list.map((x) => (x.key === m.key ? { ...x, frequency: e.target.value } : x)),
                              )
                            }
                            className="input"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setMedications((list) => list.filter((x) => x.key !== m.key))}
                          className="btn-icon shrink-0 text-ink-400 hover:text-red-600"
                          aria-label={`Remove ${m.medication || "medication"}`}
                        >
                          <IconClose className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Allergies */}
              <div className="border-t border-ink-200/80 pt-5">
                <div className="mb-3">
                  <h3 className="text-[13px] font-semibold text-ink-900">Allergies and intolerances</h3>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    Surfaced at the top of the receiving provider&rsquo;s view, above everything else.
                  </p>
                </div>
                {allergies.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {allergies.map((a) => (
                      <li key={a.key} className="rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <span className="mt-0.5 shrink-0 chip-critical">Allergy</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] leading-snug text-red-900">{a.display}</p>
                            <p className="mono-id mt-0.5 text-red-700/70">SNOMED {a.code}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAllergies((list) => list.filter((x) => x.key !== a.key))}
                            className="btn-icon shrink-0 text-red-400 hover:text-red-700"
                            aria-label={`Remove ${a.display}`}
                          >
                            <IconClose className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                          <div>
                            <label className="label" htmlFor={`alg-reaction-${a.key}`}>
                              Reaction
                            </label>
                            <input
                              id={`alg-reaction-${a.key}`}
                              value={a.reaction}
                              onChange={(e) =>
                                setAllergies((list) =>
                                  list.map((x) => (x.key === a.key ? { ...x, reaction: e.target.value } : x)),
                                )
                              }
                              className="input"
                              placeholder="e.g. Urticaria"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`alg-crit-${a.key}`}>
                              Criticality
                            </label>
                            <select
                              id={`alg-crit-${a.key}`}
                              value={a.criticality}
                              onChange={(e) =>
                                setAllergies((list) =>
                                  list.map((x) => (x.key === a.key ? { ...x, criticality: e.target.value } : x)),
                                )
                              }
                              className="select"
                            >
                              <option value="high">High</option>
                              <option value="low">Low</option>
                              <option value="unable-to-assess">Unable to assess</option>
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`alg-cat-${a.key}`}>
                              Category
                            </label>
                            <select
                              id={`alg-cat-${a.key}`}
                              value={a.category}
                              onChange={(e) =>
                                setAllergies((list) =>
                                  list.map((x) => (x.key === a.key ? { ...x, category: e.target.value } : x)),
                                )
                              }
                              className="select"
                            >
                              <option value="medication">Medication</option>
                              <option value="food">Food</option>
                              <option value="environment">Environment</option>
                            </select>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <CodedSearch
                  id="alg-search"
                  title="Search allergies"
                  options={snomed
                    .filter((o) => o.display.toLowerCase().includes("allergy"))
                    .map((o) => ({ ...o, group: "SNOMED CT" }))}
                  onAdd={(opt) =>
                    setAllergies((list) => [
                      ...list,
                      {
                        key: Date.now() + Math.random(),
                        system: "snomed",
                        code: opt.code,
                        display: opt.display,
                        reaction: "",
                        criticality: "high",
                        category: "medication",
                      },
                    ])
                  }
                  placeholder="e.g. penicillin"
                />
              </div>
            </section>
          )}

          {/* ================= Privacy ================= */}
          {step.id === "privacy" && (
            <section className="space-y-5">
              <SectionHeading
                step={5}
                title="On what basis may this information be shared?"
                description="Health information is sensitive personal information under the Data Privacy Act of 2012 (RA 10173). HealthLink records the specific basis for each exchange and enforces it."
              />

              {errors.lawfulBasisCode && <FieldError>{errors.lawfulBasisCode}</FieldError>}

              <fieldset className="space-y-2">
                <legend className="label">
                  Lawful basis <span className="text-red-600">*</span>
                </legend>
                {lawfulBases.map((b) => {
                  const selected = form.lawfulBasisCode === b.code;
                  return (
                    <label
                      key={b.code}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                        selected ? "border-brand-400 bg-brand-50/60" : "border-ink-200 bg-white hover:border-ink-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="lawfulBasis"
                        value={b.code}
                        checked={selected}
                        onChange={() => set("lawfulBasisCode", b.code)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#047857]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink-900">{b.display}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-600">{b.note}</span>
                        <span className="mono-id mt-1 block">{b.legalRef}</span>
                        {b.requiresConsentRecord && (
                          <span className="mt-1.5 inline-block chip-warn">Requires recorded authorisation</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {lawfulBases.find((b) => b.code === form.lawfulBasisCode)?.requiresConsentRecord && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[12.5px] font-semibold text-amber-900">Patient authorisation</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="consentName" className="label">
                        Authorised by <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="consentName"
                        value={form.consentName}
                        onChange={(e) => set("consentName", e.target.value)}
                        className="input"
                        placeholder={patient ? patient.fullName : "Patient full name"}
                      />
                    </div>
                    <div>
                      <label htmlFor="consentRelation" className="label">
                        Relationship to patient
                      </label>
                      <select
                        id="consentRelation"
                        value={form.consentRelation}
                        onChange={(e) => set("consentRelation", e.target.value)}
                        className="select"
                      >
                        <option value="self">The patient themselves</option>
                        <option value="spouse">Spouse</option>
                        <option value="parent">Parent</option>
                        <option value="guardian">Legal guardian</option>
                        <option value="attorney-in-fact">Attorney-in-fact</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="consentWitness" className="label">
                        Witnessed by
                      </label>
                      <input
                        id="consentWitness"
                        value={form.consentWitness}
                        onChange={(e) => set("consentWitness", e.target.value)}
                        className="input"
                        placeholder="Staff member who witnessed the authorisation"
                      />
                    </div>
                    <div>
                      <label htmlFor="consentPeriodEnd" className="label">
                        Valid until
                      </label>
                      <input
                        id="consentPeriodEnd"
                        type="date"
                        value={form.consentPeriodEnd}
                        onChange={(e) => set("consentPeriodEnd", e.target.value)}
                        className="input"
                      />
                      <p className="field-hint">Defaults to one year if left blank.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="confidentialityLevel" className="label">
                    Confidentiality level
                  </label>
                  <select
                    id="confidentialityLevel"
                    value={form.confidentialityLevel}
                    onChange={(e) => set("confidentialityLevel", e.target.value)}
                    className="select"
                  >
                    <option value="normal">Normal</option>
                    <option value="restricted">Restricted</option>
                    <option value="highly-restricted">Highly restricted</option>
                  </select>
                  <p className="field-hint">
                    Use restricted for behavioural health, HIV, substance use and similar sensitive categories.
                  </p>
                </div>
                <div>
                  <label htmlFor="dataMinimisationNote" className="label">
                    Data minimisation note
                  </label>
                  <input
                    id="dataMinimisationNote"
                    value={form.dataMinimisationNote}
                    onChange={(e) => set("dataMinimisationNote", e.target.value)}
                    className="input"
                  />
                  <p className="field-hint">
                    Why this data set is the minimum necessary for the receiving provider to act.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ================= Review ================= */}
          {step.id === "review" && (
            <section className="space-y-4">
              <SectionHeading
                step={6}
                title="Review and send"
                description="HealthLink maps this to FHIR R4, validates it against the draft Philippine Core profiles, and routes it to the receiving facility."
              />

              <ReviewBlock title="Patient" ok={!!patient}>
                {patient ? (
                  <>
                    <p className="text-[13px] font-medium text-ink-900">{patient.fullName}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-600">
                      {patient.sex === "male" ? "Male" : patient.sex === "female" ? "Female" : patient.sex} ·{" "}
                      {computeAge(patient.birthDate)} · {patient.barangay ?? "address not recorded"}
                    </p>
                    <p className="mono-id mt-1">
                      MRN {patient.mrn ?? "—"}
                      {patient.philhealth ? ` · PhilHealth ${patient.philhealth}` : ""}
                    </p>
                  </>
                ) : (
                  <Missing>No patient selected</Missing>
                )}
              </ReviewBlock>

              <ReviewBlock title="Routing" ok={!!facility && !!form.reasonCode}>
                {facility ? (
                  <p className="text-[13px] text-ink-900">
                    to <span className="font-medium">{facility.name}</span>
                  </p>
                ) : (
                  <Missing>No receiving facility selected</Missing>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="chip-neutral capitalize">{form.priority} priority</span>
                  {form.reasonCode && (
                    <span className="chip-neutral">
                      {reasonCodes.find((r) => r.code === form.reasonCode)?.display ?? form.reasonCode}
                    </span>
                  )}
                </div>
              </ReviewBlock>

              <ReviewBlock title="Clinical content">
                <ul className="space-y-2">
                  <Check ok={!!form.chiefComplaint.trim()} label="Chief complaint" />
                  <Check ok={!!form.historyOfPresent.trim()} label="History of present illness" advisory />
                  <Check ok={!!form.physicalExamination.trim()} label="Physical examination" advisory />
                  <Check ok={!!form.assessment.trim()} label="Assessment" />
                  <Check ok={!!form.requestedAction.trim()} label="Requested action" />
                  <Check
                    ok={diagnoses.filter((d) => d.code).length > 0}
                    label={`Coded diagnoses (${diagnoses.filter((d) => d.code).length})`}
                  />
                  <Check ok={observations.length > 0} label={`Observations (${observations.length})`} advisory />
                  <Check ok={medications.length > 0} label={`Medications (${medications.length})`} advisory />
                  <Check ok={allergies.length > 0} label={`Allergies (${allergies.length})`} advisory />
                </ul>
              </ReviewBlock>

              <ReviewBlock title="Privacy">
                <p className="text-[12.5px] text-ink-900">
                  {lawfulBases.find((b) => b.code === form.lawfulBasisCode)?.display ?? "Not selected"}
                </p>
                <p className="mono-id mt-0.5">{lawfulBases.find((b) => b.code === form.lawfulBasisCode)?.legalRef}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="chip-neutral capitalize">{form.confidentialityLevel}</span>
                  {form.consentName && <span className="chip-positive">Consent from {form.consentName}</span>}
                </div>
              </ReviewBlock>

              <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.routeImmediately}
                    onChange={(e) => set("routeImmediately", e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#047857]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-ink-900">Validate and route immediately</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-600">
                      HealthLink maps the referral to FHIR R4, validates it against the draft Philippine Core profiles
                      and routes it to the receiving facility. If any requirement is unmet, the referral is saved as a
                      draft and you are shown exactly what is outstanding.
                    </span>
                  </span>
                </label>
              </div>
            </section>
          )}
        </div>

        {/* ---------------- Footer ---------------- */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/80 px-5 py-3.5 no-print">
          <button
            type="button"
            onClick={() => goTo(Math.max(stepIndex - 1, 0))}
            disabled={stepIndex === 0}
            className="btn-secondary"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-ink-400">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
            {stepIndex < STEPS.length - 1 ? (
              <button type="button" onClick={advance} className="btn-primary">
                Continue
                <IconArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? (
                  "Submitting…"
                ) : form.routeImmediately ? (
                  <>
                    <IconCheck className="h-3.5 w-3.5" />
                    Validate and route
                  </>
                ) : (
                  "Save as draft"
                )}
              </button>
            )}
          </div>
        </footer>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-red-700" role="alert">
      <IconAlert className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

function SelectedPatient({ patient, onChange }: { patient: PatientOption; onChange: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IconCheck className="h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-[14px] font-medium text-ink-900">{patient.fullName}</p>
          </div>
          <p className="mt-1 text-[12px] text-ink-600">
            {patient.sex === "male" ? "Male" : patient.sex === "female" ? "Female" : patient.sex} ·{" "}
            {computeAge(patient.birthDate)} · {patient.barangay ?? "address not recorded"}
          </p>
          <p className="mono-id mt-1">
            MRN {patient.mrn ?? "—"}
            {patient.philhealth ? ` · PhilHealth ${patient.philhealth}` : ""}
          </p>
        </div>
        <button type="button" onClick={onChange} className="btn-secondary btn-sm shrink-0">
          Change
        </button>
      </div>
    </div>
  );
}

function PatientPicker({
  patients,
  onSelect,
}: {
  patients: PatientOption[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 30);
    return patients
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (p.mrn ?? "").toLowerCase().includes(q) ||
          (p.philhealth ?? "").toLowerCase().includes(q) ||
          (p.barangay ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [patients, query]);

  return (
    <>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, medical record number, PhilHealth PIN or barangay"
          aria-label="Search patients"
          className="input h-10 pl-10"
        />
      </div>

      <ul className="mt-3 max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200 thin-scroll">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-[12.5px] text-ink-500">
            No patient matched. In a production deployment staff could register a new patient here.
          </li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                <IconUserCircle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink-900">{p.fullName}</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">
                  {p.sex === "male" ? "M" : p.sex === "female" ? "F" : "?"} · {computeAge(p.birthDate)} ·{" "}
                  {p.barangay ?? "—"}
                </span>
                <span className="mono-id mt-0.5 block">{p.mrn ?? "no MRN"}</span>
              </span>
              <IconArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-400">
        This prototype uses synthetic patient records. In deployment the registry would be populated by facility
        systems and reconciled on the PhilHealth PIN and PhilSys ID.
      </p>
    </>
  );
}

function Narrative({
  id,
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  required,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="textarea"
        placeholder={placeholder}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function CodedSearch({
  id,
  title,
  options,
  onAdd,
  placeholder,
}: {
  id: string;
  title: string;
  options: CodedOption[];
  onAdd: (opt: CodedOption) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return options.filter((o) => o.display.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)).slice(0, 30);
  }, [options, query]);

  return (
    <div>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          aria-label={title}
          className="input h-9 pl-9 text-[13px]"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="mt-1.5 max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-pop thin-scroll">
          {results.map((o) => (
            <li key={`${o.group}-${o.code}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAdd(o);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ink-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-ink-900">{o.display}</span>
                  <span className="mono-id block">
                    {o.group ? `${o.group} · ` : ""}
                    {o.code}
                  </span>
                </span>
                <IconPlus className="h-3.5 w-3.5 shrink-0 text-brand-600" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1.5 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5 text-[11.5px] text-ink-500">
          No match in the bundled terminology subset. In deployment, the full national terminology server would be
          queried.
        </p>
      )}
    </div>
  );
}

function ReviewBlock({
  title,
  ok = true,
  children,
}: {
  title: string;
  ok?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${ok ? "border-ink-200 bg-white" : "border-red-200 bg-red-50/50"}`}
    >
      <p className="section-label mb-2">{title}</p>
      {children}
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] font-medium text-red-700">{children}</p>;
}

function Check({ ok, label, advisory }: { ok: boolean; label: string; advisory?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
          ok ? "bg-brand-500 text-white" : advisory ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
        }`}
        aria-hidden="true"
      >
        {ok ? <IconCheck className="h-2.5 w-2.5" /> : advisory ? "!" : "×"}
      </span>
      <span className={`text-[12px] ${ok ? "text-ink-700" : advisory ? "text-amber-800" : "text-red-800"}`}>
        {label}
      </span>
      {!ok && (
        <span className="ml-auto text-[10.5px] text-ink-400">{advisory ? "advisory" : "required"}</span>
      )}
    </li>
  );
}

function errorForStep(errors: Record<string, string>, stepId: string): boolean {
  const map: Record<string, string[]> = {
    patient: ["patientId"],
    referral: ["receivingFacilityId", "reasonCode", "reasonNarrative", "requestedAction"],
    clinical: ["chiefComplaint", "assessment"],
    codes: ["diagnoses"],
    privacy: ["lawfulBasisCode"],
  };
  return (map[stepId] ?? []).some((k) => !!errors[k]);
}

function numOrUndef(v: string): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

void Fact;
