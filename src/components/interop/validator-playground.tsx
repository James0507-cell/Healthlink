"use client";

import { useActionState, useState } from "react";
import { validateJsonAction, type ValidateJsonState } from "@/app/actions/interop";
import { Card, Alert } from "@/components/ui";
import { IconCheck, IconAlert, IconCode, IconRefresh } from "@/components/icons";

const SAMPLES: Array<{ label: string; note: string; json: string }> = [
  {
    label: "Valid PH Core Patient",
    note: "Conformant: required elements present, PSGC address extensions, PhilHealth and PhilSys identifiers.",
    json: JSON.stringify(
      {
        resourceType: "Patient",
        id: "example-patient-001",
        meta: { profile: ["https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-patient"] },
        identifier: [
          {
            use: "official",
            type: {
              coding: [{ system: "https://healthlink.davao.gov.ph/CodeSystem/local", code: "philhealth-id" }],
            },
            system: "http://philhealth.gov.ph/fhir/Identifier/philhealth-id",
            value: "63-584789845-5",
          },
        ],
        name: [{ use: "official", family: "Dela Cruz", given: ["Juan", "Santos"] }],
        telecom: [{ system: "phone", value: "+63-912-345-6789", use: "mobile" }],
        gender: "male",
        birthDate: "1980-01-01",
        address: [
          {
            use: "home",
            type: "physical",
            line: ["Km. 8, Buhangin Road"],
            city: "City of Davao",
            state: "Davao del Sur",
            postalCode: "8000",
            country: "PH",
            extension: [
              {
                url: "https://fhir.doh.gov.ph/phcore/StructureDefinition/region",
                valueCoding: {
                  system: "https://psa.gov.ph/classification/psgc",
                  code: "1100000000",
                  display: "Region XI (Davao Region)",
                },
              },
              {
                url: "https://fhir.doh.gov.ph/phcore/StructureDefinition/city-municipality",
                valueCoding: {
                  system: "https://psa.gov.ph/classification/psgc",
                  code: "112402000",
                  display: "City of Davao",
                },
              },
              {
                url: "https://fhir.doh.gov.ph/phcore/StructureDefinition/barangay",
                valueCoding: {
                  system: "https://psa.gov.ph/classification/psgc",
                  code: "112402050",
                  display: "Buhangin",
                },
              },
            ],
          },
        ],
        maritalStatus: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus", code: "M", display: "Married" },
          ],
          text: "Married",
        },
      },
      null,
      2,
    ),
  },
  {
    label: "Condition missing a required subject",
    note: "PH Core tightens Condition.subject to 1..1. HealthLink refuses to route a referral whose diagnoses are not attributable to a patient.",
    json: JSON.stringify(
      {
        resourceType: "Condition",
        id: "condition-no-subject",
        meta: { profile: ["https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-condition"] },
        clinicalStatus: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active", display: "Active" },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
              code: "confirmed",
              display: "Confirmed",
            },
          ],
        },
        code: {
          coding: [
            {
              system: "http://hl7.org/fhir/sid/icd-10",
              code: "E11.9",
              display: "Type 2 diabetes mellitus without complications",
            },
          ],
          text: "Type 2 diabetes mellitus",
        },
      },
      null,
      2,
    ),
  },
  {
    label: "Provenance violating the provenance-1 invariant",
    note: "PH Core requires onBehalfOf when the agent is a Practitioner. This is the traceability rule that keeps every clinical change attributable to a facility as well as a person.",
    json: JSON.stringify(
      {
        resourceType: "Provenance",
        id: "provenance-no-onbehalfof",
        meta: { profile: ["https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-provenance"] },
        target: [{ reference: "ServiceRequest/sr-example" }],
        recorded: "2026-10-13T02:15:00Z",
        activity: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/provenance-activity-type",
              code: "CREATE",
              display: "create",
            },
          ],
        },
        agent: [
          {
            type: {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
                  code: "author",
                  display: "Author",
                },
              ],
            },
            who: { reference: "Practitioner/usr-example" },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    label: "Observation with an unknown LOINC code",
    note: "Advisory only. A code outside the bundled subset raises a warning, not an error, because the national value sets are still in draft.",
    json: JSON.stringify(
      {
        resourceType: "Observation",
        id: "observation-unusual-code",
        meta: { profile: ["https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-observation"] },
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "laboratory",
                display: "Laboratory",
              },
            ],
          },
        ],
        code: { coding: [{ system: "http://loinc.org", code: "99999-9", display: "Not a real LOINC code" }] },
        subject: { reference: "Patient/example-patient-001" },
        valueQuantity: { value: 5.4, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
      },
      null,
      2,
    ),
  },
  {
    label: "Malformed input (structure errors)",
    note: "Invalid id characters, an unknown administrative gender, and a birth date that is not a date. The validator reports each separately.",
    json: JSON.stringify(
      {
        resourceType: "Patient",
        id: "not a valid id!!",
        name: [{ family: "Bautista" }],
        gender: "MALE",
        birthDate: "12/01/1980",
      },
      null,
      2,
    ),
  },
];

const RULES = [
  { n: "1", label: "Structural conformance", text: "Resource type, id format and datatype shapes." },
  { n: "2", label: "Cardinality", text: "FHIR R4 base rules plus PH Core's tightened minimums and maximums, evaluated per element instance." },
  { n: "3", label: "Terminology", text: "Required and extensible bindings, then membership of the bundled LOINC, ICD-10 and SNOMED CT subsets." },
  { n: "4", label: "Reference targets", text: "Whether a reference points at a resource type the profile permits." },
  { n: "5", label: "PH Core invariants", text: "Such as provenance-1, which requires onBehalfOf when the agent is a Practitioner." },
  { n: "6", label: "Bundle integrity", text: "Duplicate fullUrl detection and resolution of internal references." },
];

export function ValidatorPlayground({ initialJson }: { initialJson: string }) {
  const [state, formAction, pending] = useActionState<ValidateJsonState, FormData>(validateJsonAction, {});
  const [json, setJson] = useState(initialJson);
  const [activeSample, setActiveSample] = useState(0);

  const parseError = (() => {
    if (!json.trim()) return "Enter a FHIR resource as JSON.";
    try {
      JSON.parse(json);
      return null;
    } catch (e) {
      return `Not valid JSON: ${(e as Error).message}`;
    }
  })();

  const result = state.result;
  const counts = result
    ? {
        errors: result.issues.filter((i) => i.severity === "error" || i.severity === "fatal").length,
        warnings: result.issues.filter((i) => i.severity === "warning").length,
        info: result.issues.filter((i) => i.severity === "information").length,
      }
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---------------- Input ---------------- */}
      <div className="space-y-4">
        <Card title="Resource to validate" divided>
          <div className="space-y-3.5">
            <div>
              <label htmlFor="sample" className="label">
                Load an example
              </label>
              <select
                id="sample"
                className="select"
                value={activeSample}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setActiveSample(i);
                  setJson(SAMPLES[i].json);
                }}
              >
                {SAMPLES.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">{SAMPLES[activeSample].note}</p>
            </div>

            <form action={formAction} className="space-y-3">
              <input type="hidden" name="json" value={json} />
              <div>
                <label htmlFor="json" className="label">
                  FHIR resource (JSON)
                </label>
                <textarea
                  id="json"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  rows={24}
                  spellCheck={false}
                  className="textarea font-mono text-[11px] leading-[1.7]"
                />
              </div>

              {parseError && (
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-700">
                  <IconAlert className="h-3.5 w-3.5" />
                  {parseError}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={pending || !!parseError} className="btn-primary">
                  {pending ? (
                    "Validating…"
                  ) : (
                    <>
                      <IconCheck className="h-3.5 w-3.5" />
                      Validate against FHIR R4 + PH Core
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJson("");
                  }}
                  className="btn-secondary"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </Card>
      </div>

      {/* ---------------- Result ---------------- */}
      <div className="space-y-4">
        {state.error && (
          <Alert tone="critical" title="Validation could not run">
            {state.error}
          </Alert>
        )}

        {result && counts ? (
          <>
            <Card
              title="Result"
              actions={
                <span className={result.valid ? "chip-positive" : "chip-critical"}>
                  {result.valid ? <IconCheck className="h-3 w-3" /> : <IconAlert className="h-3 w-3" />}
                  {result.valid ? "Conformant" : "Not conformant"}
                </span>
              }
              divided
            >
              <div className="mb-4 flex flex-wrap gap-2">
                <span className={counts.errors ? "chip-critical" : "chip-neutral"}>
                  {counts.errors} error{counts.errors === 1 ? "" : "s"}
                </span>
                <span className={counts.warnings ? "chip-warn" : "chip-neutral"}>
                  {counts.warnings} warning{counts.warnings === 1 ? "" : "s"}
                </span>
                <span className="chip-neutral">{counts.info} info</span>
              </div>

              {result.profilesApplied.length > 0 && (
                <div className="mb-4">
                  <p className="section-label mb-1.5">Profiles applied</p>
                  <ul className="space-y-1">
                    {result.profilesApplied.map((p) => (
                      <li key={p} className="mono-id break-all text-brand-700">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="section-label mb-2">Findings</p>
              <ul className="space-y-1.5">
                {result.issues.map((issue, i) => {
                  const style =
                    issue.severity === "error" || issue.severity === "fatal"
                      ? "chip-critical"
                      : issue.severity === "warning"
                        ? "chip-warn"
                        : "chip-info";
                  return (
                    <li key={i} className="rounded-lg border border-ink-200 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={style}>{issue.severity}</span>
                        <span className="mono-id">{issue.code}</span>
                      </div>
                      {issue.expression && <p className="mono-id mt-1 break-all">{issue.expression}</p>}
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-700">{issue.diagnostics}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card
              title="OperationOutcome"
              description="As returned to a FHIR client."
              actions={<IconCode className="h-3.5 w-3.5 text-ink-400" />}
              divided
            >
              <pre className="code-block thin-scroll max-h-80 text-[10.5px]">{result.outcomeJson}</pre>
            </Card>
          </>
        ) : (
          !state.error && (
            <Card
              title="What gets checked"
              description="HealthLink validates in this order, stopping at nothing: every rule is evaluated so a single run gives a complete picture."
              divided
            >
              <ol className="space-y-3.5">
                {RULES.map((r) => (
                  <li key={r.n} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-600">
                      {r.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-ink-900">{r.label}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{r.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Alert tone="neutral" className="mt-4">
                <p>
                  <span className="font-medium">Errors block routing.</span> Warnings are reported for review and do not
                  block, because the national terminology value sets are still in draft and rejecting a valid code would
                  block patient care.
                </p>
              </Alert>
            </Card>
          )
        )}

        {pending && (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-ink-500">
            <IconRefresh className="h-4 w-4 animate-spin" />
            Running validation…
          </div>
        )}
      </div>
    </div>
  );
}
