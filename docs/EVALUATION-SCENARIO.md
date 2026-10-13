# HealthLink — Evaluation Scenario

A single
continuing clinical case followed from referral to closed loop across four user roles.

This is written to serve the **task-based walkthrough** described in Chapter 3 of the study: a
participant reviews a referral, attaches a clinical summary, routes it, updates its status, and
records feedback — using synthetic data only.

---

## The case

**Ernesto Abad**, 55-year-old man, is enrolled at **Buhangin District Health Center**, a primary
care facility in Davao City. He has attended three times in two weeks with the same complaint.

**Presenting problem.** Two weeks of intermittent chest discomfort on exertion, radiating to the
left arm, relieved by rest. Once, while carrying roofing material, it lasted fifteen minutes and
made him stop and sit down.

**What makes this a referral.** The health center can measure his blood pressure, take an ECG on a
single-lead device, and send blood for troponin. It cannot catheterise, cannot admit for observation,
and has no cardiologist. He has a family history of early heart attack — his father died at 58 — and
no visible risk-factor management. The health center physician is fairly confident this is stable
angina that needs a specialist opinion and probably an angiogram.

**What makes this a problem today.** Dr. Reyes at Buhangin cannot be sure what Mr. Abad's prior
work-up already shows. If an ECG and troponin were already done at another facility three weeks ago,
sending him to a tertiary hospital for the same tests is duplication, cost, and two days of lost
income for a tricycle driver. Without a shared record, the referral is driven by uncertainty: "I
cannot verify his history, so I am sending him somewhere that can."

**What HealthLink changes.** The referral carries the clinical picture with it, is validated before
it is transmitted, and stays visible until the cardiologist's answer comes back.

---

## Cast

| Role in the scenario | Sign in as | Facility |
| --- | --- | --- |
| Referring physician | `physician@buhangin.example.ph` | Buhangin District Health Center |
| Receiving cardiologist | `specialist@synapse.example.ph` | Synapse Regional Medical Center |
| Receiving referral coordinator | `coordinator@synapse.example.ph` | Synapse Regional Medical Center |
| Privacy / compliance officer | `auditor@healthlink.example.ph` | Network-wide |

Password for all accounts: `HealthLink!2026`

---

## Part 1 — The referring physician creates and routes the referral

**Sign in as `physician@buhangin.example.ph`.** The dashboard opens on what is waiting on this
facility, ordered by clinical urgency.

### Step 1.1 — Start a referral

Click **New referral**. The wizard has six steps because a referral has six things to decide, and
grouping them is how the form stays usable under time pressure.

> **Observer prompt.** Is this how you would prepare a referral today? What would you write first?

### Step 1.2 — Step 1: Patient

Search `Abad` and select **Ernesto Abad**.

Note what the record carries: a facility-local MRN (`BHC-2026-000101`), a PhilHealth PIN, and a
PhilSys ID. **This matters** — a shared name and birth date cannot safely match a patient across two
facilities. Two men named Ernesto Abad can live in the same barangay.

> **Observer prompt.** How does your facility currently identify a patient sent to you from another
> clinic? Would you trust that identification?

### Step 1.3 — Step 2: Referral

Choose the receiving facility **Synapse Regional Medical Center — tertiary**. Notice it shows its
service capabilities (cardiology, ICU, catheterisation lab).

Select reason **Specialist consultation** and priority **Urgent**.

Write in the narrative and requested action:

- **Referral narrative:** *"Two weeks of exertional chest discomfort radiating to the left arm,
  relieved by rest, once lasting 15 minutes. Family history of premature myocardial infarction.
  Currently on no maintenance medication. Requires cardiology assessment; this facility has no
  cardiologist and cannot admit for observation."*
- **Requested action:** *"Please assess for stable angina versus unstable angina, and advise on the
  need for coronary angiography. Please advise on optimal medical therapy in the interim."*

> **Observer prompt.** Look at the "Requested action" field. Have you ever received a referral where
  you could not tell what the sender actually wanted? What does that cost you?

### Step 1.4 — Step 3: Clinical summary

This is the section the receiving provider decides from. Fill in:

- **Chief complaint:** *"Chest discomfort on exertion for two weeks"*
- **History of present illness:** *"Two weeks of intermittent retrosternal pressure, onset on
  carrying heavy loads, radiating to the left arm and jaw, relieved within five minutes by rest. One
  episode lasted 15 minutes. Two episodes in the past week. No pain at rest. No syncope, no
  orthopnoea. Not currently taking any cardiac medication; ran out of amlodipine three weeks ago and
  has not returned to the health center."*
- **Past medical history:** *"Hypertension, diagnosed 2019, irregular follow-up. No known diabetes.
  No previous myocardial infarction or stroke."*
- **Family history:** *"Father died of myocardial infarction at age 58."*
- **Personal and social history:** *"Smokes 10 cigarettes daily for 30 years. Occasional alcohol.
  Tricycle driver, works 10-hour shifts."*
- **Physical examination:** *"Alert, not in distress at rest. Blood pressure 148/92 mmHg. Heart rate
  84 bpm, regular. Respiratory rate 18/min. SpO₂ 97% on room air. Chest clear. Heart sounds normal,
  no murmur, no raised JVP. No pedal oedema. Peripheral pulses intact."*
- **Assessment:** *"Stable angina pectoris, Canadian Cardiovascular Society class II, on a background
  of poorly controlled hypertension and current smoking. No features of unstable angina at rest.
  Needs risk stratification and consideration of coronary angiography."*
- **Management to date:** *"Aspirin 80 mg given as a single dose. ECG performed — shows sinus rhythm
  with no acute ST changes. Troponin I sent: within normal range. Amlodipine restarted. Counselled on
  smoking cessation."*

Click **Fill normal values** for the vitals, then correct them to the values above: 148/92, HR 84,
RR 18, temp 36.7, SpO₂ 97, weight 72, height 168, pain 3.

> **Implementation note.** Vitals recorded here are not just text. They are mapped to LOINC-coded
> FHIR Observations with UCUM units and a derived BMI, so the receiving system reads structured
> numbers rather than parsing narrative.

> **Observer prompt.** Would you fill all of this in during a real consultation? If not, which parts
> feel like they would get skipped — and can the receiving provider still make a safe decision?

### Step 1.5 — Step 4: Diagnoses and results

Add **I20.9 Angina pectoris, unspecified** (search "angina", ICD-10). Set role **Primary**,
certainty **Confirmed**.

Add a second diagnosis: **I10 Essential (primary) hypertension**, role Secondary.

Now add the objective findings the receiving provider needs. Click **Add example results**, then add
an ECG impression. Search `EKG impression` under observations and set the text value:
*"Sinus rhythm, rate 82. No acute ST elevation or depression. Non-specific T-wave flattening in V5-V6."*

Also add **10839-9 Troponin I** with value `0.02` ng/mL — the normal result that is actually the key
clinical point, because it argues against acute injury.

> **Observer prompt.** This is where duplication is prevented. Have you ever repeated a troponin
> because the previous one was not available to you?

### Step 1.6 — Step 5: Consent

The lawful basis defaults to **Provision of medical treatment / care coordination** (RA 10173
s.12(b) / s.13(b)). Read the alternatives listed. Notice that only *patient consent* requires a
recorded authorisation.

For this referral, change the basis to **Patient consent (written or electronic)** and complete the
authorisation block:

- **Authorised by:** *Ernesto Abad*
- **Relationship:** *The patient themselves*
- **Witnessed by:** *Nurse Maria Dela Cruz*
- **Valid until:** leave blank (defaults to one year)

Set **Confidentiality level** to **Normal**.

> **Observer prompt.** Which of these bases would your facility actually rely on for a routine
> specialist referral? Who currently records that decision, and where?

### Step 1.7 — Step 6: Review and send

The review page shows a checklist. Note that it distinguishes **required** items from **advisory**
ones. Missing objective findings would be advisory — the system warns but does not block, because
refusing to send a referral in a resource-poor setting would harm the patient.

Leave **Validate and route immediately** checked, and click **Validate and route**.

**What just happened, in order:**

1. HealthLink mapped the referral to a FHIR R4 `transaction` Bundle — 20-plus linked resources.
2. It validated that bundle against FHIR R4 and the draft Philippine Core profiles.
3. Routing was blocked would be the outcome if any required element were missing.
4. The bundle was persisted and transmitted over the shared FHIR API.

You land on the referral detail page with status **Submitted**.

> **Observer prompt.** How long did that take compared with your current process? What would have
> been different?

---

## Part 2 — The receiving facility reviews and decides

**Sign in as `specialist@synapse.example.ph`** (Dr. Emmanuel Cruz, Cardiology).

The dashboard now shows the referral in **Waiting on your facility**. The notification bell carries
the same count.

### Step 2.1 — Review the referral

Open it. Read the page as a clinician would:

- **Allergies are hoisted to the top** in red. This is deliberate: the most dangerous omission in a
  referral is a missed allergy, so it is placed above everything else.
- **Requested action** sits in an accent block, because that is what you were asked to do.
- **Vitals** are shown as a structured grid with units.

Open the **History** tab. Every state change is listed with the actor, role, facility, timestamp, and
its FHIR `Task.status` mapping. The referral's provenance is not a claim, it is a record.

> **Observer prompt.** Is anything you would need still missing? What would you do right now, today,
> if this were all you had?

### Step 2.2 — Acknowledge receipt

In the **Actions** panel, click **Acknowledge receipt**. Add a note: *"Received by cardiology intake.
Reviewed by Dr. Cruz."* Confirm.

Status moves to **Received**. The referring physician's dashboard now shows the referral is no
longer waiting on them — it is being handled. That visibility is the point.

### Step 2.3 — Begin review

Click **Begin review**. Status moves to **Under review**.

### Step 2.4 — Ask for something the referral genuinely lacks (the loop going backwards)

In a real case, the receiving provider often needs one more thing. The ECG here is a single-lead
tracing, and Dr. Cruz wants the actual 12-lead.

Click **Request more information**. Enter:

- **Reason / clinical note:** *"The attached ECG is a single-lead tracing from the health center
  device. I need the 12-lead ECG performed at the health center as a PDF, plus the full laboratory
  report including the lipid profile if it was done. Also confirm whether the patient has ever had
  an echocardiogram at any facility."*
- **Message body:** *"To decide between medical management and angiography I need the 12-lead
  tracing. If the 12-lead was not done, please perform one and attach it. Lipids and HbA1c would help
  me assess overall risk."*
- **Message type:** Request for information

Status moves to **Awaiting information**.

> **Observer prompt.** This is a real cost to the patient — a second visit, another wait. The system
> makes the request explicit and traceable. Does that change the incentive to ask only for what
> matters?

> **Alternative if you are short of time.** The seeded referral `HL-2026-BUH-00001` (Rosario
> Maquiling) is already at this stage: the receiving endocrinologist has asked for a recent HbA1c,
> creatinine with eGFR, and an albumin-to-creatinine ratio, with an explanation of why. Opening it
> shows the same behaviour without spending the minutes.

### Step 2.5 — The referring facility supplies the information

**Sign out. Sign in as `physician@buhangin.example.ph`.**

The dashboard shows the referral back in *Waiting on your facility*, with **Awaiting information**.
Open it and read the request in the Feedback tab — it is a proper message, not a stray phone call
nobody documented.

Click **Provide information**. Attach the missing document: in the **Documents** panel, use the
attachment form:

- **Title:** *12-lead ECG report*
- **Type:** Diagnostic report
- **Content:**
  ```
  12-LEAD ECG REPORT

  Indication: exertional chest discomfort
  Rate: 82 bpm    Rhythm: sinus    Axis: normal

  Findings:
    ST segments: no elevation or depression
    T waves: flattened in V5-V6, otherwise normal
    Q waves: none pathological
    Intervals: PR 156 ms, QRS 92 ms, QTc 412 ms

  Impression: Sinus rhythm with non-specific lateral T-wave changes.
  No evidence of acute ischaemia or prior infarction.

  Performed at: Buhangin District Health Center
  ```

Then click **Provide information** in the Actions panel with the note: *"12-lead ECG attached as
requested. Also attached is the full laboratory panel; lipids show total cholesterol 232 mg/dL and
LDL 151 mg/dL. No prior echocardiogram has been done at this facility. Patient reports no imaging
elsewhere."*

Include a message: *"Clinical management update — patient remains free of rest pain. Amlodipine
continued; aspirin started."*

Status returns to **Under review**.

> **Observer prompt.** Compare this with how your facility answers such a request today. What is
> gained by having the exchange recorded rather than handled by phone?

### Step 2.6 — Accept the referral

**Sign out. Sign in as `specialist@synapse.example.ph`** again, and open the referral.

Click **Accept referral**:

- **Clinical outcome:** For outpatient follow-up
- **Note:** *"Accepted for cardiology outpatient assessment. Stable angina CCS class II with
  hypertension and active smoking. Non-specific lateral T-wave changes but no evidence of acute
  ischaemia. Plan: exercise stress testing at the next available slot; if positive, proceed to
  coronary angiography. Optimise medical therapy in the interim."*

Status moves to **Accepted**.

### Step 2.7 — Schedule the appointment

Click **Schedule appointment** and set a date and time a few days ahead. Add a message:
*"Patient scheduled for cardiology clinic. Please advise the patient to bring previous records and to
continue aspirin."*

Status moves to **Scheduled**. The patient-facing lookup now shows a date.

> **Optional.** Use the patient view: open **Where is my referral?** in a private window, or from the
> sidebar. Enter the referral number and the tracking code shown on this referral. Notice what is
> shown — status, facilities, dates — and what is not: no diagnosis, no results, no medication, no
> clinician names. That is deliberate minimum disclosure.

### Step 2.8 — The patient is seen, and the outcome is recorded

Click **Record patient seen**. Then click **Complete & send feedback**:

- **Clinical outcome:** For procedure / surgery
- **Note:**
  ```
  Attended cardiology clinic. Exercise stress test positive for inducible ischaemia at moderate
  workload (7 METs), with 1 mm ST depression in leads V4-V6 and reproduction of the presenting
  chest discomfort.

  Coronary angiography performed the following day: 80% stenosis of the mid left anterior
  descending artery, otherwise non-obstructive disease. Successful drug-eluting stent deployed to
  the mid-LAD. No complications.

  Discharged the following day.
  ```
- **Message subject:** *"Outcome and discharge summary — stable angina with LAD stenosis, PCI performed"*
- **Message body:**
  ```
  Mr. Abad was assessed in cardiology clinic and found to have inducible ischaemia on stress
  testing. Angiography showed a single significant lesion: 80% stenosis of the mid-LAD. He
  underwent successful PCI with a drug-eluting stent and was discharged the next day without
  complications.

  Discharge medications:
    Aspirin 80 mg once daily (indefinite)
    Clopidogrel 75 mg once daily (12 months)
    Atorvastatin 40 mg once nightly
    Metoprolol 50 mg twice daily
    Amlodipine 10 mg once daily

  Cardiology clinic review in 4 weeks. Please reinforce smoking cessation — he has now had a
  stent and this is the single most important thing he can do.

  Please arrange a lipid profile and HbA1c at the health center before the 4-week review.
  ```
- **Message type:** Clinical feedback

Status moves to **Completed**. The referral is *not yet closed* — the loop closes only when the
referring provider acknowledges.

> **Observer prompt.** This is the part that is usually missing: the referring clinic never learns
> what happened. How often do you currently find out the outcome of a patient you referred?

---

## Part 3 — Closing the loop

**Sign in as `physician@buhangin.example.ph`.** The referral appears in *Waiting on your facility*
because the loop is not closed yet.

Open it and read the returned outcome and discharge summary. Notice the feedback is structured
clinical content — diagnosis, procedure, medication list, follow-up plan — not a one-line note.

Click **Acknowledge feedback & close**. Add: *"Feedback acknowledged. Patient reviewed at the health
center; lipid profile and HbA1c requested for the 4-week cardiology review. Smoking cessation
counselling reinforced; he has been referred to the quitline."*

Status moves to **Closed with feedback**. The referral is complete.

> **Observer prompt.** What does it change for you to know the outcome — both for this patient's
> care and for how you would manage the next one?

---

## Part 4 — Governance and oversight

### Step 4.1 — Consent register

**Sign in as `admin@healthlink.example.ph`** (HIE administrator) and open **Consent** in the sidebar.

Find the record for Ernesto Abad. It shows the basis relied on, who authorised it, the classes of
data in scope, the facilities in scope, and the validity period.

Now demonstrate revocation. **Sign in as `specialist@synapse.example.ph`**, open the referral, and
under **Consent** click **Revoke consent for this exchange**. Give the reason: *"Patient withdrew
authorisation for further sharing of this record, confirmed by telephone and witnessed by nursing
staff."*

Now observe what actually changes:

- The consent record is marked **revoked**, with the reason and who did it.
- The referral is marked **highly restricted**.
- Attempting to open an attached document returns a refusal, not the document.
- Further exchange is refused at the API layer.

This is the point worth noting: revocation is not a cosmetic status change. It has consequences.

> **Observer prompt.** If a patient asked you to stop sharing their record tomorrow, what would
> happen today? How long would it take, and how would you know it had worked?

### Step 4.2 — The audit trail

**Sign in as `auditor@healthlink.example.ph`.**

Open **Audit trail**. At the top, the integrity banner reports the chain intact and the record count.

Notice what is captured across the walkthrough you just performed:

- Every sign-in, including a failed attempt and the account lockout after repeated failures.
- The referral created, validated, and routed.
- Each workflow transition with the actor, role, and facility.
- The information request and the response to it.
- The document attached, and **each time a document was retrieved**.
- Validation runs, with error and warning counts.
- **Refused attempts** — where a user tried to open a referral belonging to another facility, or a
  role tried to retrieve an attachment it may not see.

That last category matters. A refusal is as significant as a success for accountability. If someone
repeatedly tries to open records that are not theirs, that pattern should be visible to a privacy
officer rather than silently discarded by the access-control layer.

> **Observer prompt.** Your facility is required to keep records of access. What would you want to
> see in a report like this? What would worry you?

### Step 4.3 — The technical claim, inspected

Still signed in, open **Interoperability → PH Core alignment**.

This page states plainly which parts of the exchange are covered by the published draft Philippine
Core FHIR Implementation Guide and which are not. Four resources — `DocumentReference`, `Consent`,
`Communication`, `AuditEvent` — are exchanged on the FHIR R4 base because no profile exists for them
in v0.2.0. Those gaps are **recorded, not hidden**.

> **Observer prompt.** This page says the national guide is a draft and that four resources have no
> profile yet. Does that honesty help or hurt your confidence in the system?

Open any referral and click the **FHIR exchange** tab to see the actual resources and the raw JSON.
This is what a receiving facility's own system reads.

---

## What this scenario demonstrates

| Study requirement | Where it is shown |
| --- | --- |
| Referral creation with clinical context | Part 1, steps 1.2–1.6 |
| Clinical summaries and attachments | Step 1.4, step 2.5 |
| FHIR mapping and validation before exchange | Step 1.7, step 4.3 |
| Secure routing across differing systems | Step 1.7, step 4.3 |
| Closed-loop status tracking | Parts 1–3, all transitions |
| Receiving-provider feedback returned | Step 2.8, Part 3 |
| Consent and lawful basis | Step 1.6, step 4.1 |
| Access control and least privilege | Parts 1–2 (role-scoped navigation), step 4.2 |
| Audit logging for traceability | Step 4.2 |
| Data minimisation and controlled sharing | Step 2.7 patient view, step 4.1 |

---

## Questions to put to participants

These map onto the four research questions, and are worth asking while the walkthrough is fresh.

**On the current process (RQ1)**

1. At which point in this scenario does the system differ most from how you work now?
2. What information did the receiving provider have here that they would not have today?
3. Which required field would be hardest to complete during a busy clinic?

**On the data model (RQ2)**

4. Is anything coded here in a way your own system could not represent?
5. Are the terminology choices appropriate for how you record these diagnoses?

**On the architecture and features (RQ3)**

6. Is the closed-loop status set the right one for how referrals actually conclude?
7. Is "request more information" handled the way you would handle it?
8. Is the patient-facing view showing too much, or too little?
9. Would the consent options match your facility's practice?

**On usability and acceptability (RQ4)**

10. Could you complete this referral without training?
11. What would stop you using this in practice?
12. Which single feature would you keep if you could keep only one?

---

## Reset before each session

Run this to restore the exact starting state. Seeded referral numbers and tracking codes are
deterministic, so this scenario stays valid across resets.

```bash
npm run db:reset
npm run demo:state    # confirm 6 referrals and an intact audit chain
```

Note that `npm test` runs against a **separate database file** and will not disturb the
demonstration data.

---

## Appendix A — The seeded referral cases

The demonstration dataset already contains six referrals at different points in the workflow. They
exist so that a participant can start from any stage without having to build it first.

| Referral | Patient | Route | State | Why it is useful |
| --- | --- | --- | --- | --- |
| `HL-2026-BUH-00001` | Rosario Maquiling | Buhangin DHC → Synapse | Awaiting information | Shows the loop going *backwards*: diabetes with an out-of-date work-up |
| `HL-2026-BUH-00002` | Danilo Fuentes | Buhangin DHC → DMGMC | Under review | Smear-positive TB awaiting a pulmonology decision |
| `HL-2026-AGD-00001` | Jomar Sarmiento | Agdao CHC → DMGMC | Closed with feedback | A complete loop, dengue with warning signs |
| `HL-2026-AGD-00002` | Michelle Tan | Agdao CHC → Synapse | Submitted | Urgent maternal referral, pre-eclampsia at 35 weeks |
| `HL-2026-AGD-00003` | Teresita Caballero | Agdao CHC → DDILC | Draft | An unrouted referral — good for demonstrating the routing checklist |
| `HL-2026-TAL-00001` | Rodel Dela Peña | Talomo FCC → Synapse | Completed | Emergency STEMI transfer; outcome recorded, loop not yet acknowledged |

**Where the chest pain case fits.** Mr. Abad's case above is *not* among them, because the point of
the walkthrough is for the participant to build it. It is a fresh referral created during the
session, which is how the Chapter 3 task-based walkthrough is described.

If time is short and you need a shortcut, `HL-2026-TAL-00001` (Rodel Dela Peña) is already an acute
chest pain case at the **Completed** stage — the receiving facility has returned its discharge
summary and the loop is waiting on the referring provider to acknowledge it. Open it in Part 3 to
demonstrate closing the loop without building a referral first.

---

## Appendix B — Mapping to the walkthrough tasks in Chapter 3

The methodology chapter describes a short task-based walkthrough in which participants *"review a
sample referral, attach a clinical summary, route it, update its status, and record feedback using
synthetic or de-identified data."*

| Chapter 3 task | This scenario |
| --- | --- |
| Review a sample referral | Step 2.1, or open any seeded referral |
| Attach a clinical summary | Step 2.5 (the 12-lead ECG report) |
| Route it | Step 1.7 |
| Update its status | Part 2, steps 2.2 through 2.8 |
| Record feedback | Step 2.8 |

The scenario is deliberately longer than the walkthrough needs, so that you can stop at whichever
task you are observing. Parts 1–3 are the clinical walkthrough; Part 4 is the governance
walkthrough, which a privacy officer or administrator would do instead.

---

## Appendix C — Timing

For a single 45-minute session with one participant, this is a realistic allocation:

| Minutes | Activity |
| --- | --- |
| 0–5 | Orientation: what HealthLink is, what this session is not claiming |
| 5–15 | Build the referral (Part 1, steps 1.1–1.7) — the referring provider's work |
| 15–25 | Review and decide (Part 2, steps 2.1–2.4) — the receiving provider's work |
| 25–32 | Attach the missing information (step 2.5) — the loop going backwards |
| 32–38 | Record the outcome and return feedback (steps 2.6–2.8) |
| 38–45 | Structured ratings and open-ended questions (RQ4) |

For a clinician participant, Parts 1–3 are the relevant material. For a medical records officer or
HIE administrator, run Part 4 instead and use the seeded referrals rather than building one.

Ask the observer prompts that are relevant to the participant's role rather than all of them.

