import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getSession,
  PERMISSIONS,
  hasPermission,
  requirePageAccess,
} from "@/lib/auth";
import { PageHeader, Alert } from "@/components/ui";
import { ValidatorPlayground } from "@/components/interop/validator-playground";

export const metadata: Metadata = { title: "Validate a resource" };
export const dynamic = "force-dynamic";

export default async function ValidatePage() {
  const session = await requirePageAccess(PERMISSIONS.FHIR_VALIDATE);

  const initial = JSON.stringify(
    {
      resourceType: "ServiceRequest",
      id: "sr-example-001",
      meta: { profile: ["https://fhir.doh.gov.ph/phcore/StructureDefinition/ph-core-serviceRequest"] },
      identifier: [
        {
          use: "official",
          system: "https://healthlink.davao.gov.ph/identifier/referral",
          value: "HL-2026-BHC-00001",
        },
      ],
      status: "active",
      intent: "order",
      priority: "urgent",
      code: {
        coding: [
          {
            system: "https://healthlink.davao.gov.ph/CodeSystem/local",
            code: "admission",
            display: "Admission / confinement",
          },
        ],
        text: "Admission / confinement",
      },
      subject: { reference: "Patient/example-patient-001" },
      encounter: { reference: "Encounter/enc-example-001" },
      authoredOn: "2026-10-13T02:15:00Z",
      requester: { reference: "Practitioner/usr-referring-001" },
    },
    null,
    2,
  );

  return (
    <>
      <PageHeader
        title="Validate a resource"
        subtitle="Paste or load any FHIR resource to see exactly which rules it satisfies and which it violates. Findings are returned as a FHIR OperationOutcome, exactly as a client would receive them."
      />

      <Alert tone="info" className="mb-5">
        <p>
          This runs the same validator that gates referral routing. It is exposed directly so the validation behaviour
          can be inspected rather than taken on trust.
        </p>
      </Alert>

      <ValidatorPlayground initialJson={initial} />
    </>
  );
}
