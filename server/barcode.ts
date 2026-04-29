import QRCode from "qrcode";
import bwipjs from "bwip-js";

function dataUrlToBuffer(dataUrl: string): Buffer {
  const [, base64Payload] = dataUrl.split(",");
  if (!base64Payload) {
    throw new Error("Invalid data URL payload");
  }
  return Buffer.from(base64Payload, "base64");
}

/**
 * Generate QR code as a PNG data URL.
 */
export async function generateQRCode(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: "H",
      type: "image/png",
      margin: 1,
      width: 300,
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    throw new Error("QR code generation failed");
  }
}

/**
 * Generate a machine-scannable Code 128 barcode as a PNG buffer.
 */
export async function generateBarcodePngBuffer(data: string): Promise<Buffer> {
  try {
    return await bwipjs.toBuffer({
      bcid: "code128",
      text: data,
      scale: 3,
      height: 18,
      includetext: true,
      textxalign: "center",
      paddingwidth: 8,
      paddingheight: 8,
      backgroundcolor: "FFFFFF",
    });
  } catch (error) {
    console.error("Failed to generate barcode:", error);
    throw new Error("Barcode generation failed");
  }
}

/**
 * Backward-compatible helper that returns a PNG data URL for UI previews/tests.
 */
export async function generateBarcodeImage(data: string): Promise<string> {
  const barcodeBuffer = await generateBarcodePngBuffer(data);
  return `data:image/png;base64,${barcodeBuffer.toString("base64")}`;
}

/**
 * Backward-compatible conversion helper. If the input is already a data URL,
 * decode it; otherwise preserve the original bytes.
 */
export async function svgToPngBuffer(imageString: string): Promise<Buffer> {
  if (imageString.startsWith("data:image/")) {
    return dataUrlToBuffer(imageString);
  }
  return Buffer.from(imageString);
}

/**
 * Generate QR and barcode artifacts for patient OPD tracking.
 */
export async function generatePatientBarcodes(patientId: string) {
  try {
    const qrCodeDataUrl = await generateQRCode(patientId);
    const qrCodePngBuffer = dataUrlToBuffer(qrCodeDataUrl);
    const barcodePngBuffer = await generateBarcodePngBuffer(patientId);
    const barcodeImage = `data:image/png;base64,${barcodePngBuffer.toString("base64")}`;

    return {
      qrCodeDataUrl,
      qrCodePngBuffer,
      barcodeImage,
      barcodePngBuffer,
      patientId,
    };
  } catch (error) {
    console.error("Failed to generate patient barcodes:", error);
    throw error;
  }
}

export const __private__ = {
  dataUrlToBuffer,
};
