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

export function generateOPFormHTML(
  template: OPFormTemplate,
  patient: PatientData,
  registeredPatient: RegisteredPatient
): string {
  const escapeHtml = (value?: string | null) =>
    String(value || "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const patientName = `${patient.firstName} ${patient.lastName}`;

  // Build field rows dynamically from template
  const fieldRows = template.headerFields
    .map((field) => {
      let value = "_______________";
      if (field.id === "name") value = escapeHtml(patientName);
      else if (field.id === "dob") value = escapeHtml(patient.dateOfBirth);
      else if (field.id === "contact") value = escapeHtml(patient.contactNumber);
      else if (field.id === "gender") value = escapeHtml(patient.gender);
      else if (field.id === "consultant") value = "_______________";
      else if (field.id === "datetime") value = "_______________";

      return `<div class="info-row"><div class="info-item"><span class="info-label">${escapeHtml(field.label)}:</span> ${value}</div></div>`;
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
          .header { display: grid; grid-template-columns: 1fr 32mm 56mm; gap: 6mm; align-items: start; border-bottom: 2px solid #111827; padding-bottom: 6mm; margin-bottom: 8mm; }
          .clinic-title { font-size: 16px; font-weight: 800; letter-spacing: 0.02em; margin: 0 0 1mm; }
          .clinic-subtitle { font-size: 11px; color: #666; margin: 0.5mm 0 0; }
          .patient-info { font-size: 9px; line-height: 1.4; }
          .info-row { display: flex; gap: 10mm; margin-bottom: 1.5mm; }
          .info-item { flex: 1; }
          .info-label { font-weight: 700; }
          .patient-id { display: inline-block; border: 1px solid #111827; padding: 1.5mm 3mm; font-family: monospace; font-size: 12px; font-weight: 800; margin-top: 2mm; }
          .qr { width: 30mm; height: 30mm; object-fit: contain; border: 1px solid #d1d5db; padding: 1mm; }
          .barcode { width: 54mm; height: 22mm; object-fit: contain; border: 1px solid #d1d5db; padding: 1mm; }
          .barcode-text { font-family: monospace; font-size: 8px; margin-top: 1mm; word-break: break-all; line-height: 1; }
          .blank-area { flex: 1; border: 1px solid #d1d5db; background: #fafafa; }
          .footer { margin-top: 6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; font-size: 10px; }
          .signature-line { border-bottom: 1px solid #111827; height: 8mm; margin-bottom: 2mm; }
          @media print { body { background: #ffffff; margin: 0; padding: 0; } .page { border: none; } }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="header">
            <div class="patient-info">
              <h1 class="clinic-title">${escapeHtml(template.clinicName)}</h1>
              ${template.clinicSubtitle ? `<p class="clinic-subtitle">${escapeHtml(template.clinicSubtitle)}</p>` : ""}
              ${fieldRows}
              <div class="patient-id">ID: ${escapeHtml(registeredPatient.patientId)}</div>
            </div>
            <div>${qrCodeHtml}</div>
            <div>
              ${barcodeHtml}
              ${barcodeHtml ? `<div class="barcode-text">${escapeHtml(registeredPatient.barcodeData)}</div>` : ""}
            </div>
          </section>

          <div class="blank-area" style="min-height: ${blankAreaHeight}mm;"></div>

          <div class="footer">
            <div><div class="signature-line"></div><p>Patient / Attendant Signature</p></div>
            <div><div class="signature-line"></div><p>Consultant Signature</p></div>
          </div>
          ${template.footerText ? `<div style="margin-top: 4mm; font-size: 8px; color: #666;">${escapeHtml(template.footerText)}</div>` : ""}
        </main>
        <script>window.onload = () => setTimeout(() => { window.print(); window.close(); }, 350);</script>
      </body>
    </html>
  `;
}
