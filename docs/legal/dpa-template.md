# Data Processing Agreement (DPA) Template

This template provides the baseline contractual clauses required to comply with GDPR Article 28 when the Association Management platform acts as a data processor on behalf of an association (data controller). Each tenant should customise the highlighted variables before sharing the signed agreement with the processor.

## Parties

- **Controller**: `<Association name>`, located at `<Address>`, represented by `<Legal Representative>`.
- **Processor**: `<SaaS Vendor name>`, located at `<Address>`, represented by `<Legal Representative>`.

## Subject Matter and Duration

- **Subject matter**: Hosting, processing, and safeguarding association management data (members, donations, accounting artefacts, uploaded files).
- **Duration**: Agreement remains in force for the duration of the subscription contract. Processor retains data only for the retention periods defined in the platform's data retention policy.

## Nature and Purpose of Processing

- Provision of the Association Management SaaS platform.
- Storage of personal data for membership management, donations, and accounting obligations.
- Generation of statutory exports (FEC, donation receipts, member data exports).
- Execution of background jobs (reminders, data purges, backups) necessary to deliver the service securely.

## Categories of Data Subjects

- Association members and former members.
- Donors (including occasional donors).
- Organisation staff and volunteers with platform accounts.

## Categories of Personal Data

- Identification data: names, addresses, phone numbers, email addresses.
- Membership details: membership type, join/leave dates, RGPD consent timestamps, personal notes.
- Financial data: donations, membership fee assignments/payments, accounting entry references linked to members or donors.
- Authentication and audit data for users with access to the platform.

## Obligations of the Processor

1. Process personal data only on documented instructions from the Controller.
2. Ensure personnel are bound by confidentiality obligations.
3. Implement appropriate technical and organisational measures (encryption in transit/at rest, access controls, monitoring, audit logs).
4. Assist the Controller in fulfilling data subject rights (access, rectification, erasure, portability, objection).
5. Assist with security incident reporting and DPIA obligations.
6. Delete or return all personal data at the end of the contract, subject to statutory retention requirements.
7. Make available all information necessary to demonstrate compliance and allow audits.
8. Obtain prior written authorisation for subcontractors and ensure equivalent contractual safeguards.

## Sub-processing

List authorised sub-processors, purposes, and geographic locations. Provide mechanism for Controller to object to changes (e.g. 30-day notice).

## International Transfers

Declare whether data leaves the EU/EEA. If applicable, reference appropriate safeguards (e.g. Standard Contractual Clauses, adequacy decisions).

## Security Measures (Annex)

Detail implemented measures, including:

- Logical access control, least privilege, MFA for administrator accounts.
- Network security (firewalls, intrusion detection).
- Data encryption, backup strategy, disaster recovery.
- Logging, monitoring, vulnerability management, penetration testing cadence.
- Employee security training and onboarding/offboarding procedures.

## Data Subject Rights Support (Annex)

Outline operational process for:

- Responding to access/portability requests using the per-member export endpoints (JSON/CSV/PDF).
- Deleting or anonymising personal notes and soft-deleting member records.
- Managing objections or restriction of processing (e.g. disabling communications).

## Incident Management (Annex)

Define SLA for notifying the Controller of personal data breaches (typically within 24h) and remediation steps.

---

**Signature blocks**

- Controller signature, name, title, date.
- Processor signature, name, title, date.
