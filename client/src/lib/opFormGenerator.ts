interface OPFormTemplate {
  clinicName: string;
  clinicSubtitle?: string;
  headerFields: Array<{
    id: string;
    label: string;
    fieldType: "text" | "date" | "dropdown" | "checkbox" | "textarea";
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  blankAreaHeight: number;
  footerText?: string;
  showQRCode: boolean;
  showBarcode: boolean;
}

interface PatientData {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  age?: string;
  gender?: string;
  contactNumber: string;
  email?: string;
  address?: string;
  consultantName?: string;
  consultantRegistrationNumber?: string;
  consultantStateCounsilSection?: string;
}

interface RegisteredPatient {
  patientId: string;
  barcodeData: string;
  barcodeImageUrl?: string;
  qrcodeImageUrl?: string;
}

export interface UserInfo {
  name: string;
  role: string;
}

export function generateOPFormHTML(
  template: OPFormTemplate,
  patient: PatientData,
  registeredPatient: RegisteredPatient,
  userInfo?: UserInfo
): string {
  const escapeHtml = (value?: string | null) =>
    String(value || "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const patientName = `${patient.firstName} ${patient.lastName}`;
  const currentDateTime = new Date().toLocaleString('en-IN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });

  const qrCodeHtml =
    template.showQRCode && registeredPatient.qrcodeImageUrl
      ? `<img class="qr" src="${escapeHtml(registeredPatient.qrcodeImageUrl)}" alt="QR code" />`
      : "";

  return `
    <html>
      <head>
        <title>A4 OP Registration Form - ${escapeHtml(registeredPatient.patientId)}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Times New Roman', Arial, serif; font-size: 12px; margin: 0; color: #111827; background: #ffffff; }
          .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 8mm; display: flex; flex-direction: column; }
          
          /* Patient details box with 3-row layout */
          .header { 
            width: 100%; 
            border: 2px solid #111827; 
            padding: 3mm; 
            margin-top: 15mm;
            margin-bottom: 8mm;
            background: #ffffff;
            position: relative;
          }
          
          .clinic-title { font-size: 13px; font-weight: 800; letter-spacing: 0.02em; margin: 0 0 1mm; }
          .clinic-subtitle { font-size: 10px; color: #666; margin: 0 0 2mm; }
          
          /* QR Code in top right */
          .qr { 
            position: absolute;
            top: 3mm;
            right: 3mm;
            width: 20mm; 
            height: 20mm; 
            object-fit: contain; 
            border: 1px solid #d1d5db; 
            padding: 0.5mm; 
          }
          
          /* Row 1: Name, Age, Gender */
          .row1 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 3mm;
            margin-bottom: 2mm;
            padding-right: 22mm;
          }
          
          /* Row 2: Contact, Address */
          .row2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin-bottom: 2mm;
          }
          
          /* Row 3: Consultant, Date/Time, ID */
          .row3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 3mm;
          }
          
          .field {
            display: flex;
            flex-direction: column;
            font-size: 10px;
          }
          
          .field-label {
            font-weight: 700;
            font-size: 12px;
            margin-bottom: 0.5mm;
          }
          
          .field-value {
            border-bottom: 1px solid #111827;
            padding: 1mm 0;
            min-height: 4mm;
            font-size: 14px;
          }
          
          /* Large empty space for clinical notes */
          .blank-area { 
            flex: 1; 
            border: 1px solid #d1d5db; 
            background: #fafafa; 
            min-height: 180mm;
            margin-bottom: 3mm;
            padding: 3mm;
            position: relative;
          }
          
          /* Consultant signature in bottom right of notes area */
          .consultant-signature {
            position: absolute;
            bottom: 3mm;
            right: 3mm;
            width: 40mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            font-size: 8px;
          }
          
          .signature-line {
            border-bottom: 1px solid #111827;
            width: 100%;
            height: 8mm;
            margin-bottom: 1mm;
          }
          
          .signature-label {
            font-size: 7px;
            font-weight: 600;
          }
          
          /* Footer - compact */
          .footer-section {
            margin-top: 1mm;
            padding-top: 1mm;
            border-top: 1px solid #111827;
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
          }
          
          .clinic-footer-text {
            font-size: 8px;
            color: #333;
            margin: 0;
            line-height: 1.2;
          }
          
          .timings-bold {
            font-weight: 700;
            font-size: 14px;
          }
          
          .user-info {
            font-size: 7px;
            color: #555;
            margin-top: 0.5mm;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- Patient Details Box -->
          <div class="header">
            <div class="clinic-title">${escapeHtml(template.clinicName)}</div>
            ${template.clinicSubtitle ? `<div class="clinic-subtitle">${escapeHtml(template.clinicSubtitle)}</div>` : ''}
            
            ${qrCodeHtml}
            
            <!-- Row 1: Name, Age, Gender -->
            <div class="row1">
              <div class="field">
                <div class="field-label">Name</div>
                <div class="field-value">${escapeHtml(patientName)}</div>
              </div>
              <div class="field">
                <div class="field-label">Age</div>
                <div class="field-value">${escapeHtml(patient.age || "___")}</div>
              </div>
              <div class="field">
                <div class="field-label">Gender</div>
                <div class="field-value">${escapeHtml(patient.gender || "___")}</div>
              </div>
            </div>
            
            <!-- Row 2: Contact, Address -->
            <div class="row2">
              <div class="field">
                <div class="field-label">Contact</div>
                <div class="field-value">${escapeHtml(patient.contactNumber)}</div>
              </div>
              <div class="field">
                <div class="field-label">Address</div>
                <div class="field-value">${escapeHtml(patient.address || "___")}</div>
              </div>
            </div>
            
            <!-- Row 3: Consultant, Date/Time, ID -->
            <div class="row3">
              <div class="field">
                <div class="field-label">Consultant</div>
                <div class="field-value">${escapeHtml(patient.consultantName || "___")}</div>
              </div>
              <div class="field">
                <div class="field-label">Date/Time</div>
                <div class="field-value">${escapeHtml(currentDateTime)}</div>
              </div>
              <div class="field">
                <div class="field-label">Patient ID</div>
                <div class="field-value">${escapeHtml(registeredPatient.patientId)}</div>
              </div>
            </div>
            
            <!-- Row 4: Registration Number, State Council Section -->
            ${patient.consultantRegistrationNumber || patient.consultantStateCounsilSection ? `
            <div class="row2" style="margin-top: 2mm;">
              <div class="field">
                <div class="field-label">Reg. No.</div>
                <div class="field-value">${escapeHtml(patient.consultantRegistrationNumber || "___")}</div>
              </div>
              <div class="field">
                <div class="field-label">State Council</div>
                <div class="field-value">${escapeHtml(patient.consultantStateCounsilSection || "___")}</div>
              </div>
            </div>
            ` : ''}
          </div>
          
          <!-- Clinical Notes Area -->
          <div class="blank-area">
            <div class="consultant-signature">
              <div class="signature-line"></div>
              <div class="signature-label">Consultant Signature</div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="footer-section">
            <div class="clinic-footer-text">At Max Diagnostics, Punjagutta</div>
            <div class="timings-bold">Available Timings: 5:30 pm-8:00 pm (Mon to Sat) & 10am-12 noon (Sun)</div>
            ${userInfo ? `<div class="user-info">Generated by: ${escapeHtml(userInfo.name)} (${escapeHtml(userInfo.role)}) | ${escapeHtml(currentDateTime)}</div>` : ''}
          </div>
        </div>
      </body>
    </html>
  `;
}

export type BrandedConsultationOP = {
  consultationId: string;
  consultationDate: string;
  patientId: string;
  firstName: string;
  lastName: string;
  age?: number | null;
  gender?: string | null;
  contactNumber: string;
  address?: string | null;
  clinicalHistory?: string | null;
  presentComplaints?: string | null;
  advisedInvestigations?: string | null;
  treatmentPlan?: string | null;
  consultantName?: string | null;
  qualifications?: string | null;
  specialization?: string | null;
  designation?: string | null;
  registrationCouncil?: string | null;
  registrationNumber?: string | null;
  prescriptionHeaderText?: string | null;
  consultantLogoUrl?: string | null;
  signatureUrl?: string | null;
  consultantLocation?: string | null;
  consultantTimings?: string | null;
  facility: { name: string; location: string; logoUrl?: string };
};

/** One canonical master OP template for browser preview and print output. */
export function generateConsultationOPHTML(op: BrandedConsultationOP): string {
  const escapeHtml = (value?: string | number | null) => String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const signature = op.signatureUrl
    ? `<img class="signature-image" src="${escapeHtml(op.signatureUrl)}" alt="Consultant signature" />`
    : `<div class="signature-line"></div>`;

  return `<!doctype html>
  <html><head><title>OP Prescription — ${escapeHtml(op.consultationId)}</title>
  <style>
    @page { size: A4 portrait; margin: 7mm 8mm 8mm; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#fff; color:#111827; }
    body { font-family: Arial, 'Times New Roman', serif; font-size:10pt; }
    .page { width:194mm; height:282mm; margin:0 auto; padding:0; display:flex; flex-direction:column; overflow:hidden; }
    .master-header { height:22mm; flex:none; position:relative; padding:0 0 2mm; border-bottom:1px solid #64748b; }
    .consultant-brand { position:absolute; top:0; right:0; width:42mm; height:22mm; display:flex; align-items:center; justify-content:center; }
    .consultant-logo { display:block; height:11mm; width:auto; max-width:30mm; object-fit:contain; flex:0 1 auto; }
    .patient-block { height:25mm; flex:none; margin-top:2mm; border:1px solid #94a3b8; display:grid; grid-template-columns:1.7fr .8fr 1.2fr; grid-template-rows:8mm 8mm 8mm; font-size:8.5pt; }
    .patient-field { min-width:0; padding:1.1mm 2mm; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; overflow:hidden; }
    .patient-field:nth-child(3n) { border-right:0; }
    .patient-field.address { grid-column:1 / -1; border-bottom:0; }
    .label { display:block; color:#64748b; font-size:7pt; line-height:1; margin-bottom:.8mm; }
    .value { display:block; color:#111827; font-size:9pt; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .clinical-area { flex:1; min-height:0; margin-top:4mm; position:relative; border-top:1px solid #334155; padding-top:2mm; }
    .clinical-title { margin:0; font-size:9pt; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#0f172a; }
    .writing-space { position:absolute; inset:8mm 0 23mm; }
    .signature-block { position:absolute; right:0; bottom:2mm; width:48mm; height:18mm; text-align:center; }
    .signature-image { display:block; width:auto; max-width:42mm; height:10mm; margin:0 auto 1mm; object-fit:contain; }
    .signature-line { width:100%; height:10mm; border-bottom:1px solid #334155; }
    .signature-label { margin-top:1mm; font-size:7pt; color:#334155; }
    .footer { flex:none; height:9mm; margin-top:2mm; border-top:1px solid #94a3b8; display:grid; grid-template-columns:minmax(0, 1fr) max-content; grid-template-rows:auto auto; column-gap:4mm; align-content:center; overflow:hidden; color:#334155; font-size:7pt; line-height:1.1; }
    .footer-meta, .footer-timings { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .footer-meta { grid-column:1; grid-row:1; }
    .footer-timings { grid-column:1; grid-row:2; }
    .footer .validity { grid-column:2; grid-row:1 / span 2; max-width:58mm; text-align:right; }
    @media print { .page { margin:0; } }
  </style></head><body><main class="page">
    <header class="master-header"><section class="consultant-brand">${op.consultantLogoUrl ? `<img class="consultant-logo" src="${escapeHtml(op.consultantLogoUrl)}" alt="Consultant logo" />` : ""}</section></header>
    <section class="patient-block" aria-label="Patient information">
      <div class="patient-field"><span class="label">Patient Name</span><span class="value">${escapeHtml(`${op.firstName} ${op.lastName}`)}</span></div>
      <div class="patient-field"><span class="label">Age / Gender</span><span class="value">${escapeHtml([op.age, op.gender].filter(Boolean).join(" / "))}</span></div>
      <div class="patient-field"><span class="label">Phone Number</span><span class="value">${escapeHtml(op.contactNumber)}</span></div>
      <div class="patient-field"><span class="label">Patient ID</span><span class="value">${escapeHtml(op.patientId)}</span></div>
      <div class="patient-field"><span class="label">Consultant</span><span class="value">${escapeHtml(op.consultantName)}</span></div>
      <div class="patient-field"><span class="label">Date / Time</span><span class="value">${escapeHtml(formatOPDateTime(op.consultationDate))}</span></div>
      <div class="patient-field address"><span class="label">Address</span><span class="value">${escapeHtml(op.address)}</span></div>
    </section>
    <section class="clinical-area" aria-label="Clinical Notes"><h2 class="clinical-title">Clinical Notes</h2><div class="writing-space" aria-label="Blank handwriting area"></div><div class="signature-block">${signature}<div class="signature-label">Signature</div></div></section>
    <footer class="footer"><span class="footer-meta">Location: ${escapeHtml(op.consultantLocation)} · Date &amp; Time: ${escapeHtml(formatOPDateTime(op.consultationDate))}</span><span class="footer-timings">Timings: ${escapeHtml(op.consultantTimings)}</span><span class="validity">OP valid only upto 4 weeks or one visit within.</span></footer>
  </main></body></html>`;
}

export function formatOPDateTime(value: string): string {
  const mysqlTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const instant = new Date(mysqlTimestamp.test(value) ? `${value.replace(" ", "T")}Z` : value);
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(instant);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.day} ${lookup.month} ${lookup.year}, ${lookup.hour}:${lookup.minute} ${lookup.dayPeriod?.toUpperCase()}`;
}
