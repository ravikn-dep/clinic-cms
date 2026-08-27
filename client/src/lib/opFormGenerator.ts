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
  facility: { name: string; location: string; logoUrl?: string };
};

/**
 * Generates a printable clinical OP only from the server-authoritative
 * consultation print-data route. The caller never supplies consultant identity
 * or image URLs independently of the consultation.
 */
export function generateConsultationOPHTML(op: BrandedConsultationOP): string {
  const escapeHtml = (value?: string | number | null) => String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const blankSection = (title: string) => `
    <section class="clinical-section paper-blank">
      <h3>${escapeHtml(title)}</h3>
      <div class="handwriting-lines" aria-label="Blank handwriting area"></div>
    </section>`;
  const consultantLogo = op.consultantLogoUrl
    ? `<img class="identity-image" src="${escapeHtml(op.consultantLogoUrl)}" alt="Consultant logo" />`
    : "";
  const facilityLogo = op.facility.logoUrl
    ? `<img class="identity-image facility-image" src="${escapeHtml(op.facility.logoUrl)}" alt="Max Diagnostics logo" />`
    : "";
  const signature = op.signatureUrl
    ? `<img class="signature-image" src="${escapeHtml(op.signatureUrl)}" alt="Consultant signature" />`
    : "";
  const consultationDate = new Date(op.consultationDate).toLocaleString("en-IN");

  return `<!doctype html>
  <html><head><title>OP Prescription — ${escapeHtml(op.consultationId)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin:0; color:#172033; font:12px Arial, 'Times New Roman', serif; background:#fff; }
    .page { min-height:277mm; border:1px solid #cbd5e1; padding:8mm; }
    .brand-header { display:grid; grid-template-columns:1fr 1fr; gap:8mm; padding-bottom:5mm; border-bottom:2px solid #0f766e; }
    .identity { min-height:33mm; display:flex; gap:4mm; align-items:flex-start; }
    .facility { justify-content:flex-end; text-align:right; border-left:1px solid #d1d5db; padding-left:7mm; }
    .identity-image { width:23mm; height:23mm; object-fit:contain; flex:none; }
    .facility-image { order:2; }
    .identity h1 { font-size:16px; margin:0 0 1.2mm; line-height:1.15; color:#0f172a; }
    .identity p { margin:.6mm 0; line-height:1.35; }
    .facility h2 { margin:0 0 1.5mm; color:#0f766e; font-size:15px; letter-spacing:.04em; }
    .muted { color:#475569; }
    .patient-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin:5mm 0; border:1px solid #cbd5e1; padding:4mm; background:#f8fafc; }
    .field-label { display:block; font-size:9px; text-transform:uppercase; color:#64748b; letter-spacing:.04em; }
    .field-value { display:block; margin-top:.8mm; font-weight:700; min-height:4mm; }
    .clinical-section { border-top:1px solid #dbe3ea; padding:3mm 0; }
    .clinical-section h3 { font-size:11px; letter-spacing:.06em; color:#0f766e; margin:0 0 1.5mm; text-transform:uppercase; }
    .clinical-section p { white-space:pre-wrap; margin:0; line-height:1.5; min-height:6mm; }
    .paper-blank { min-height:25mm; }
    .handwriting-lines { min-height:17mm; background: repeating-linear-gradient(to bottom, transparent 0, transparent 7mm, #cbd5e1 7.2mm, transparent 7.6mm); }
    .signature-block { margin-top:7mm; margin-left:auto; width:64mm; min-height:28mm; text-align:center; border-top:1px solid #94a3b8; padding-top:2mm; }
    .signature-image { max-width:50mm; max-height:15mm; object-fit:contain; display:block; margin:0 auto 1mm; }
    .signature-name { font-weight:700; margin:1mm 0; }
    .footer { margin-top:5mm; padding-top:2mm; border-top:1px solid #cbd5e1; color:#64748b; font-size:9px; display:flex; justify-content:space-between; }
  </style></head><body><main class="page">
    <header class="brand-header">
      <section class="identity consultant">${consultantLogo}<div>
        <h1>${escapeHtml(op.consultantName)}</h1>
        ${op.qualifications ? `<p>${escapeHtml(op.qualifications)}</p>` : ""}
        ${op.designation ? `<p class="muted">${escapeHtml(op.designation)}</p>` : ""}
        ${op.specialization ? `<p class="muted">${escapeHtml(op.specialization)}</p>` : ""}
        ${(op.registrationCouncil || op.registrationNumber) ? `<p class="muted">${escapeHtml(op.registrationCouncil)}${op.registrationCouncil && op.registrationNumber ? " · " : ""}${escapeHtml(op.registrationNumber)}</p>` : ""}
        ${op.prescriptionHeaderText ? `<p>${escapeHtml(op.prescriptionHeaderText)}</p>` : ""}
      </div></section>
      <section class="identity facility"><div><h2>${escapeHtml(op.facility.name)}</h2><p>${escapeHtml(op.facility.location)}</p></div>${facilityLogo}</section>
    </header>
    <section class="patient-grid">
      <div><span class="field-label">Patient name</span><span class="field-value">${escapeHtml(`${op.firstName} ${op.lastName}`)}</span></div>
      <div><span class="field-label">Patient ID</span><span class="field-value">${escapeHtml(op.patientId)}</span></div>
      <div><span class="field-label">Visit / date</span><span class="field-value">${escapeHtml(consultationDate)}</span></div>
      <div><span class="field-label">Age</span><span class="field-value">${escapeHtml(op.age)}</span></div>
      <div><span class="field-label">Gender</span><span class="field-value">${escapeHtml(op.gender)}</span></div>
      <div><span class="field-label">Contact number</span><span class="field-value">${escapeHtml(op.contactNumber)}</span></div>
    </section>
    ${blankSection("Chief complaints / history")}
    ${blankSection("Clinical examination / findings")}
    ${blankSection("Investigations")}
    ${blankSection("Diagnosis / assessment")}
    ${blankSection("Treatment / prescription")}
    ${blankSection("Advice / follow-up")}
    <section class="signature-block">${signature}<p class="signature-name">${escapeHtml(op.consultantName)}</p><p>${escapeHtml(op.qualifications)}</p><p>${escapeHtml(op.registrationNumber)}</p></section>
    <footer class="footer"><span>${escapeHtml(op.facility.name)} · ${escapeHtml(op.facility.location)}</span><span>Consultation ${escapeHtml(op.consultationId)}</span></footer>
  </main></body></html>`;
}
