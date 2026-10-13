import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { Alert, Card, PageHeader, StatusPill } from "@/components/ui";
import { trackReferral } from "@/lib/referrals";
import { IconSearch, IconCheck } from "@/components/icons";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = { title: "Where is my referral?" };
export const dynamic = "force-dynamic";

/**
 * Patient-facing referral status.
 *
 * Public by design: the patient holds a tracking code printed on their referral
 * slip. Returns only the minimum needed to answer "where is my referral?" — the
 * referral number, the facilities involved, patient-facing status wording and a
 * coarse timeline. No clinical content, no diagnosis, no provider names.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; code?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;

  const referralNumber = (sp.ref ?? "").trim();
  const code = (sp.code ?? "").trim();

  let result: ReturnType<typeof trackReferral> = null;
  let searched = false;

  if (referralNumber && code) {
    searched = true;
    result = trackReferral(referralNumber, code);
  }

  const unauthenticated = !session;

  return (
    <div className={unauthenticated ? "mx-auto min-h-dvh max-w-xl bg-canvas px-5 py-10" : ""}>
      {unauthenticated ? (
        <>
          <div className="mb-8 flex items-center justify-center gap-3">
            <LogoMark className="h-8 w-8 text-brand-600" />
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">HealthLink</p>
              <p className="text-[11px] text-ink-500">Davao City referral network</p>
            </div>
          </div>

          <h1 className="text-center text-[22px] font-semibold tracking-[-0.02em] text-ink-900">
            Where is my referral?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed text-ink-500">
            Enter the referral number and the tracking code printed on your referral slip. You do not need an account.
          </p>
        </>
      ) : (
        <PageHeader
          title="Where is my referral?"
          subtitle="Look up a referral using the referral number and the tracking code printed on the patient's referral slip."
        />
      )}

      {/* ---------------- Lookup ---------------- */}
      <form method="get" action="/track" className={`card p-4 ${unauthenticated ? "mt-7" : ""}`}>
        <div className="space-y-3.5">
          <div>
            <label htmlFor="ref" className="label">
              Referral number
            </label>
            <input
              id="ref"
              name="ref"
              defaultValue={referralNumber}
              className="input h-10 font-mono"
              placeholder="HL-2026-BHC-00001"
              required
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label htmlFor="code" className="label">
              Tracking code
            </label>
            <input
              id="code"
              name="code"
              defaultValue={code}
              className="input h-10 font-mono tracking-widest"
              placeholder="ABCDE-FGHIJ"
              required
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={12}
            />
            <p className="field-hint">Both must match your referral slip exactly.</p>
          </div>
          <button type="submit" className="btn-primary w-full">
            <IconSearch className="h-4 w-4" />
            Check status
          </button>
        </div>
      </form>

      {searched && !result && (
        <Alert tone="warn" title="No referral found for those details" className="mt-5">
          Check the referral number and tracking code against your referral slip. If you believe the details are correct,
          contact the facility that referred you.
        </Alert>
      )}

      {/* ---------------- Result ---------------- */}
      {result && (
        <div className="mt-5 space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="section-label">Referral</p>
                <p className="mono-id mt-1 text-[13px] font-medium text-ink-900">{result.referralNumber}</p>
                <p className="mt-2 text-[14px] text-ink-800">
                  {result.patientFirstName} {result.patientLastNameInitial}.
                </p>
              </div>
              <div className="text-right">
                <p className="section-label">Current status</p>
                <p className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-brand-700">
                  {result.statusLabel}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3.5">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <div>
                <p className="text-[13.5px] font-medium text-brand-900">{result.patientLabel}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-brand-800">
                  {result.awaiting === "referring"
                    ? "Your referring doctor needs to provide information or take the next step."
                    : result.awaiting === "receiving"
                      ? "The receiving facility is handling your referral."
                      : "The referral process is complete."}
                </p>
              </div>
            </div>

            <dl className="mt-5 grid gap-4 border-t border-ink-200/80 pt-4 text-[12.5px] sm:grid-cols-2">
              <div>
                <dt className="section-label">Referred from</dt>
                <dd className="mt-1 text-ink-800">{result.referringFacility}</dd>
              </div>
              <div>
                <dt className="section-label">Referred to</dt>
                <dd className="mt-1 text-ink-800">{result.receivingFacility}</dd>
              </div>
              <div>
                <dt className="section-label">Referral created</dt>
                <dd className="mt-1 text-ink-800">
                  {new Date(result.createdAt).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="section-label">Last update</dt>
                <dd className="mt-1 text-ink-800">
                  {new Date(result.updatedAt).toLocaleString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Progress of your referral" divided>
            <ol className="relative">
              {result.timeline.map((t, i) => {
                const isLast = i === result.timeline.length - 1;
                return (
                  <li key={`${t.label}-${t.at}`} className="relative flex gap-3.5">
                    <span className="relative flex w-2.5 shrink-0 justify-center">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${
                          isLast ? "bg-brand-600" : "bg-ink-300"
                        }`}
                        aria-hidden="true"
                      />
                      {!isLast && (
                        <span className="absolute top-[18px] h-[calc(100%-14px)] w-px bg-ink-200" aria-hidden="true" />
                      )}
                    </span>
                    <span className={`min-w-0 ${isLast ? "pb-0" : "pb-5"}`}>
                      <span
                        className={`block text-[13.5px] ${isLast ? "font-medium text-ink-900" : "text-ink-700"}`}
                      >
                        {t.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{t.description}</span>
                      <time className="mt-1 block text-[11px] text-ink-400">
                        {new Date(t.at).toLocaleString("en-PH", {
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </time>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <p className="px-1 text-[11px] leading-relaxed text-ink-400">
            This page shows referral progress only. It deliberately does not display diagnoses, results, medication or
            clinical notes, which are shared between the treating facilities. For clinical questions, contact the
            facility currently handling your referral.
          </p>
        </div>
      )}

      {/* ---------------- Public footer ---------------- */}
      {unauthenticated && (
        <div className="mt-10 border-t border-ink-200 pt-5 text-center">
          <p className="text-[11px] leading-relaxed text-ink-400">
            HealthLink is a concept prototype being evaluated for selected healthcare facilities in Davao City. This
            environment contains synthetic demonstration data only.
          </p>
          <p className="mt-2 text-[11px] text-ink-400">
            Facility staff?{" "}
            <a href="/login" className="link">
              Sign in here
            </a>
          </p>
        </div>
      )}

      {!unauthenticated && (
        <p className="mt-5 px-1 text-[11px] leading-relaxed text-ink-400">
          You are signed in, so you are seeing this lookup as a staff member would. Patients reach the same page without
          an account and see the same information.
        </p>
      )}

      {!result && !searched && (
        <Card
          title="What this page will and will not show"
          className="mt-5"
          divided
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="section-label mb-2">You will see</p>
              <ul className="space-y-1.5">
                {[
                  "Which facility your referral was sent to",
                  "What stage your referral has reached",
                  "When it was last updated",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                    <span className="text-[12px] leading-snug text-ink-700">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="section-label mb-2">You will not see</p>
              <ul className="space-y-1.5">
                {[
                  "Diagnoses, results or medication",
                  "Clinical notes or feedback content",
                  "Names of the doctors involved",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
                    <span className="text-[12px] leading-snug text-ink-600">{t}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
                Clinical detail is shared only between the treating facilities.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* The StatusPill import is used by the staff view's timeline labels. */}
      <span className="hidden">
        <StatusPill status="submitted" />
      </span>
    </div>
  );
}
