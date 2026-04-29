import QRCode from "qrcode";

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(data: string): Promise<string> {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      errorCorrectionLevel: "H",
      type: "image/png",
      margin: 1,
      width: 300,
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    throw new Error("QR code generation failed");
  }
}

/**
 * Generate barcode as SVG string (using text representation)
 * In production, use a proper barcode library like jsbarcode
 */
export function generateBarcodeImage(data: string): string {
  // Create a simple barcode representation as SVG
  // For production, integrate jsbarcode library
  const svgBarcode = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
      <rect width="300" height="100" fill="white"/>
      <text x="150" y="50" font-size="24" font-weight="bold" text-anchor="middle" font-family="monospace">
        ${data}
      </text>
      <text x="150" y="85" font-size="12" text-anchor="middle" font-family="monospace">
        OPD Tracking Barcode
      </text>
    </svg>
  `;
  return svgBarcode;
}

/**
 * Convert SVG to PNG buffer (requires additional library in production)
 */
export async function svgToPngBuffer(svgString: string): Promise<Buffer> {
  // In production, use a library like sharp or svg2png
  // For now, return a placeholder
  return Buffer.from(svgString);
}

/**
 * Generate both QR code and barcode for patient
 */
export async function generatePatientBarcodes(patientId: string) {
  try {
    const qrCodeDataUrl = await generateQRCode(patientId);
    const barcodeImage = generateBarcodeImage(patientId);

    return {
      qrCodeDataUrl,
      barcodeImage,
      patientId,
    };
  } catch (error) {
    console.error("Failed to generate patient barcodes:", error);
    throw error;
  }
}
