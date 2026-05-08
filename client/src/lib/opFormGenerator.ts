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
  dateOfBirth: string;
  gender?: string;
  contactNumber: string;
  email?: string;
  address?: string;
  consultantName?: string;
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

  // Build field rows dynamically from template - compact format
  const fieldRows = template.headerFields
    .map((field) => {
      let value = "_______________";
      if (field.id === "name") value = escapeHtml(patientName);
      else if (field.id === "dob") value = escapeHtml(patient.dateOfBirth);
      else if (field.id === "contact") value = escapeHtml(patient.contactNumber);
      else if (field.id === "gender") value = escapeHtml(patient.gender);
      else if (field.id === "consultant") value = "_______________";
      else if (field.id === "datetime") value = "_______________";

      return `<div class="info-row"><span class="info-label">${escapeHtml(field.label)}:</span> <span class="info-value">${value}</span></div>`;
    })
    .join("");

  const blankAreaHeight = template.blankAreaHeight || 200;
  const qrCodeHtml =
    template.showQRCode && registeredPatient.qrcodeImageUrl
      ? `<img class="qr" src="${escapeHtml(registeredPatient.qrcodeImageUrl)}" alt="QR code" />`
      : "";
  const barcodeHtml =
    template.showBarcode && registeredPatient.barcodeImageUrl
      ? `<img class="barcode" src="${escapeHtml(registeredPatient.barcodeImageUrl)}" alt="Barcode" />`
      : "";

  return `
    <html>
      <head>
        <title>A4 OP Registration Form - ${escapeHtml(registeredPatient.patientId)}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #ffffff; }
          .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 8mm; display: flex; flex-direction: column; }
          
          /* Compact patient details box: 18cm × 4cm */
          .header { 
            width: 180mm; 
            height: 40mm; 
            border: 2px solid #111827; 
            padding: 3mm; 
            display: grid; 
            grid-template-columns: 1fr 32mm; 
            gap: 4mm; 
            align-items: start; 
            margin-top: 15mm;
            margin-bottom: 8mm;
            background: #ffffff;
            position: relative;
          }
          
          .header .qr {
            position: absolute;
            top: 3mm;
            right: 3mm;
          }
          
          .clinic-title { font-size: 14px; font-weight: 800; letter-spacing: 0.02em; margin: 0 0 0.5mm; }
          .clinic-subtitle { font-size: 9px; color: #666; margin: 0.5mm 0 1mm; }
          .patient-info { font-size: 8px; line-height: 1.3; }
          .info-row { display: flex; gap: 4mm; margin-bottom: 0.8mm; align-items: center; }
          .info-label { font-weight: 700; min-width: 20mm; }
          .info-value { flex: 1; }
          .patient-id { display: inline-block; border: 1px solid #111827; padding: 1mm 2mm; font-family: monospace; font-size: 10px; font-weight: 800; margin-top: 1mm; }
          .qr { width: 28mm; height: 28mm; object-fit: contain; border: 1px solid #d1d5db; padding: 0.5mm; }
          .barcode { display: none; }
          .barcode-text { display: none; }
          
          /* Large empty space for clinical notes */
          .blank-area { 
            flex: 1; 
            border: 1px solid #d1d5db; 
            background: #fafafa; 
            min-height: ${blankAreaHeight}mm;
            margin-bottom: 8mm;
          }
          
          /* Footer with clinic info and user signature - compact within 10mm */
          .footer-section {
            margin-top: 2mm;
            padding-top: 1mm;
            border-top: 1px solid #111827;
            max-height: 10mm;
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
          }
          
          .clinic-footer-text {
            font-size: 7px;
            color: #333;
            margin: 0;
            line-height: 1.2;
            font-weight: 500;
          }
          
          .signature-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            font-size: 8px;
            margin-bottom: 0;
          }
          
          .signature-box {
            display: flex;
            flex-direction: column;
          }
          
          .signature-line { 
            border-bottom: 1px solid #111827; 
            height: 4mm; 
            margin-bottom: 0.5mm; 
          }
          
          .signature-label { 
            font-size: 6px; 
            margin: 0;
          }
          
          .user-info {
            margin-top: 0;
            padding-top: 0.5mm;
            border-top: none;
            font-size: 6px;
            display: flex;
            justify-content: space-between;
            gap: 2mm;
          }
          
          .user-generated {
            display: flex;
            flex-direction: column;
          }
          
          .user-generated-label {
            margin: 0;
            font-weight: bold;
            font-size: 6px;
          }
          
          .user-generated-value {
            margin: 0;
            font-size: 6px;
            line-height: 1;
          }
          
          .user-datetime {
            text-align: right;
            display: flex;
            flex-direction: column;
          }
          
          .user-datetime-label {
            margin: 0;
            font-weight: bold;
            font-size: 6px;
          }
          
          .user-datetime-value {
            margin: 0;
            font-size: 6px;
            line-height: 1;
          }
          
          @media print { 
            body { background: #ffffff; margin: 0; padding: 0; } 
            .page { border: none; } 
          }
        </style>
      </head>
      <body>
        <main class="page">
          <!-- Compact Patient Details Box: 18cm × 4cm -->
          <section class="header">
            <div class="patient-info">
              <h1 class="clinic-title">${escapeHtml(template.clinicName)}</h1>
              ${template.clinicSubtitle ? `<p class="clinic-subtitle">${escapeHtml(template.clinicSubtitle)}</p>` : ""}
              ${fieldRows}
              <div class="patient-id">ID: ${escapeHtml(registeredPatient.patientId)}</div>
            </div>
            <div>${qrCodeHtml}</div>
          </section>

          <!-- Large Empty Space for Clinical Notes -->
          <div class="blank-area"></div>

          <!-- Footer Section -->
          <div class="footer-section">
            <!-- Signature Lines -->
            <div class="signature-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <p class="signature-label">Patient / Attendant Signature</p>
              </div>
              <div class="signature-box">
                <div class="signature-line"></div>
                <p class="signature-label">Consultant Signature</p>
              </div>
            </div>

            <!-- Clinic Footer Text -->
            <p class="clinic-footer-text">
              At Max Diagnostics, Punjagutta - Available timings: 5:30 pm-8:00 pm (Mon to Sat) & 10am-12 noon (Sun)
            </p>

            <!-- User Info and Timestamp -->
            ${userInfo ? `<div class="user-info">
              <div class="user-generated">
                <p class="user-generated-label">Generated by:</p>
                <p class="user-generated-value">${escapeHtml(userInfo.name)}</p>
                <p class="user-generated-value" style="color: #666;">(${escapeHtml(userInfo.role)})</p>
              </div>
              <div class="user-datetime">
                <p class="user-datetime-label">Date & Time:</p>
                <p class="user-datetime-value">${new Date().toLocaleDateString()}</p>
                <p class="user-datetime-value">${new Date().toLocaleTimeString()}</p>
              </div>
            </div>` : ""}
          </div>
        </main>
        <script>window.onload = () => setTimeout(() => { window.print(); window.close(); }, 350);</script>
      </body>
    </html>
  `;
}
