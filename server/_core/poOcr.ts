import { invokeLLM } from "./llm";

export interface ExtractedPOData {
  vendorName: string;
  vendorContactNumber: string;
  vendorGstNumber: string;
  vendorAddress: string;
  vendorDlNumbers: string[];
  poToName: string;
  poToContactNumber: string;
  poToAddress: string;
  poToGstNumber?: string;
  items: {
    name: string;
    quantity: string;
    expiryDate?: string;
    batchNumber?: string;
    valuePerItem: string;
    discount?: string;
    totalValue: string;
  }[];
  totalDiscount: string;
  totalValue: string;
  rawText: string;
}

export async function extractPOFromImage(imageUrl: string): Promise<ExtractedPOData> {
  const extractionPrompt = `You are an expert OCR system for extracting Purchase Order (PO) information from images.

Extract the following information from the PO image and return a JSON object:

{
  "vendorName": "Vendor company name",
  "vendorContactNumber": "Contact number",
  "vendorGstNumber": "GST number",
  "vendorAddress": "Full address",
  "vendorDlNumbers": ["DL number 1", "DL number 2"],
  "poToName": "PO recipient name/company",
  "poToContactNumber": "Recipient contact number",
  "poToAddress": "Recipient address",
  "poToGstNumber": "Recipient GST (optional)",
  "items": [
    {
      "name": "Item name",
      "quantity": "Quantity",
      "expiryDate": "DD/MM/YYYY or blank",
      "batchNumber": "Batch number or blank",
      "valuePerItem": "Price per unit",
      "discount": "Discount amount or blank",
      "totalValue": "Total value for this item"
    }
  ],
  "totalDiscount": "Total discount of PO",
  "totalValue": "Total value of PO"
}

Be precise and extract all visible information. If a field is not visible, use empty string or null.
Return ONLY valid JSON, no other text.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an OCR expert for extracting Purchase Order data from images. Return only valid JSON."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: extractionPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "po_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              vendorName: { type: "string" },
              vendorContactNumber: { type: "string" },
              vendorGstNumber: { type: "string" },
              vendorAddress: { type: "string" },
              vendorDlNumbers: { type: "array", items: { type: "string" } },
              poToName: { type: "string" },
              poToContactNumber: { type: "string" },
              poToAddress: { type: "string" },
              poToGstNumber: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "string" },
                    expiryDate: { type: "string" },
                    batchNumber: { type: "string" },
                    valuePerItem: { type: "string" },
                    discount: { type: "string" },
                    totalValue: { type: "string" }
                  },
                  required: ["name", "quantity", "valuePerItem", "totalValue"]
                }
              },
              totalDiscount: { type: "string" },
              totalValue: { type: "string" }
            },
            required: ["vendorName", "poToName", "items", "totalValue"]
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (typeof content !== "string") {
      throw new Error("Invalid response from LLM");
    }

    const extractedData = JSON.parse(content);
    
    return {
      ...extractedData,
      rawText: content
    };
  } catch (error) {
    console.error("OCR extraction failed:", error);
    throw new Error(`Failed to extract PO data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
