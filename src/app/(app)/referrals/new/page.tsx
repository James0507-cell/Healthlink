import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, PERMISSIONS, hasPermission } from "@/lib/auth";
import { listPatients, listFacilities } from "@/lib/referrals";
import { ICD10, SNOMED, LOINC, LAWFUL_BASIS, REASON_FOR_REFERRAL, LOINC as LOINC_MAP } from "@/lib/fhir/terminology";
import { PageHeader } from "@/components/ui";
import { NewReferralWizard, type PresetObservation } from "@/components/referral/new-referral-wizard";

export const metadata: Metadata = { title: "New referral" };
export const dynamic = "force-dynamic";

export default async function NewReferralPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.REFERRAL_CREATE)) redirect("/dashboard");

  const patients = listPatients({ limit: 200 }).map((p) => ({
    id: p.id,
    fullName: `${p.given_name} ${p.family_name}`,
    mrn: p.local_mrn ?? null,
    philhealth: p.philhealth_id ?? null,
    sex: p.sex,
    birthDate: p.birth_date,
    barangay: p.barangay_display ?? null,
    phone: p.phone ?? null,
  }));

  const facilities = listFacilities({ receiving: true })
    .filter((f) => f.id !== session.facilityId)
    .map((f) => ({
      id: f.id,
      name: f.name,
      shortName: f.short_name ?? null,
      level: f.level ?? null,
      ownership: f.ownership ?? null,
      city: f.city_display ?? null,
      services: f.services,
    }));

  const icd10 = Object.values(ICD10).map((c) => ({ code: c.code, display: c.display }));
  const snomed = Object.values(SNOMED).map((display, i) => ({
    code: Object.keys(SNOMED)[i],
    display,
  }));
  const loinc = Object.values(LOINC_MAP).map((l) => ({
    code: l.code,
    display: l.display,
    group: l.group,
  }));

  const lawfulBases = Object.values(LAWFUL_BASIS).map((b) => ({
    code: b.code,
    display: b.display,
    legalRef: b.legalRef,
    requiresConsentRecord: b.requiresConsentRecord,
    note: b.note,
  }));

  const reasonCodes = REASON_FOR_REFERRAL.map((r) => ({ code: r.code, display: r.display }));

  // "Example results" preset so the evaluation walkthrough is quick; values are
  // plausible synthetic findings, not suggestions about a real patient.
  const presets: {
    vitals: PresetObservation[];
    observations: PresetObservation[];
  } = {
    vitals: [],
    observations: [
      {
        system: "loinc",
        code: "718-7",
        display: "Hemoglobin [Mass/volume] in Blood",
        category: "laboratory",
        valueNum: "13.5",
        valueText: "",
        unit: "g/dL",
        ucum: "g/dL",
        refLow: "12",
        refHigh: "17.5",
      },
      {
        system: "loinc",
        code: "6690-2",
        display: "Leukocytes [#/volume] in Blood by Automated count",
        category: "laboratory",
        valueNum: "8.2",
        unit: "10^3/uL",
        ucum: "10*3/uL",
        valueText: "",
        refLow: "4",
        refHigh: "11",
      },
      {
        system: "loinc",
        code: "2339-0",
        display: "Glucose [Mass/volume] in Blood",
        category: "laboratory",
        valueNum: "112",
        unit: "mg/dL",
        ucum: "mg/dL",
        valueText: "",
        refLow: "70",
        refHigh: "140",
      },
    ],
  };

  return (
    <>
      <PageHeader
        title="New referral"
        subtitle="Prepare a structured referral with the clinical summary the receiving provider needs, then validate and route it."
      />
      <NewReferralWizard
        patients={patients}
        facilities={facilities}
        icd10={icd10}
        snomed={snomed}
        loinc={loinc}
        lawfulBases={lawfulBases}
        reasonCodes={reasonCodes}
        presets={presets}
        defaultFacilityId=""
      />
    </>
  );
}
