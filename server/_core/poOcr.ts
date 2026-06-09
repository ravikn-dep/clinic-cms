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
  invoiceDate?: string;
  invoiceNumber?: string;
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
  confidence?: {
    vendorName: number;
    vendorContactNumber: number;
    vendorGstNumber: number;
    vendorAddress: number;
    poToName: number;
    poToContactNumber: number;
    poToAddress: number;
    poToGstNumber: number;
    items: Array<{
      name: number;
      quantity: number;
      valuePerItem: number;
      totalValue: number;
    }>;
    totalValue: number;
  };
}

export async function extractPOFromImage(imageUrl: string): Promise<ExtractedPOData> {
  const extractionPrompt = `You are an expert OCR system for extracting Purchase Order and GST Invoice information from images.

Extract the following information from the PO/Invoice image and return a JSON object:

{
  "vendorName": "Vendor/Supplier company name (from 'From' or sender section)",
  "vendorContactNumber": "Vendor contact number or phone",
  "vendorGstNumber": "Vendor GST number (look for 'GST NO' or 'GSTIN')",
  "vendorAddress": "Full vendor address including city and postal code",
  "vendorDlNumbers": ["DL number 1", "DL number 2"],
  "poToName": "Bill recipient name/company (from 'To' or 'Bill To' section)",
  "poToContactNumber": "Recipient contact number or phone",
  "poToAddress": "Full recipient address including city and postal code",
  "poToGstNumber": "Recipient GST number (if visible)",
  "invoiceDate": "Invoice date in DD/MM/YYYY format",
  "invoiceNumber": "Invoice or bill number",
  "items": [
    {
      "name": "Item name (from PRODUCT NAME column)",
      "quantity": "Quantity (from QTY column)",
      "expiryDate": "Expiry date in DD/MM/YYYY format (from EXP column)",
      "batchNumber": "Batch number (from BATCH column)",
      "valuePerItem": "Unit price/MRP (from M.R.P or RATE column)",
      "discount": "Discount per item or blank",
      "totalValue": "Total amount for item (from AMOUNT column)"
    }
  ],
  "totalDiscount": "Total discount amount (from invoice totals)",
  "totalValue": "Total invoice amount (from NET AMOUNT or Total Due)",
  "confidence": {
    "vendorName": 0.95,
    "vendorContactNumber": 0.85,
    "vendorGstNumber": 0.90,
    "vendorAddress": 0.88,
    "poToName": 0.92,
    "poToContactNumber": 0.87,
    "poToAddress": 0.89,
    "poToGstNumber": 0.80,
    "items": [
      {
        "name": 0.93,
        "quantity": 0.91,
        "valuePerItem": 0.89,
        "totalValue": 0.90
      }
    ],
    "totalValue": 0.94
  }
}

IMPORTANT NOTES FOR GST INVOICES:
1. Look for 'GST INVOICE' header to identify invoice type
2. Extract GST NO from the invoice header (format: XXYAIQPRXXXXPXZB)
3. Look for 'To' section for bill recipient details (company name, address, contact)
4. Extract items from the itemized table with columns: HSNCODE, PRODUCT NAME, PACK, MFG, BATCH, EXP, QTY, FREE, M.R.P, RATE, AMOUNT
5. Extract expiry date in DD/MM format (e.g., 01/28 means January 28) and convert to DD/MM/YYYY
6. Extract batch number from BATCH column (e.g., CARO 02260181)
7. Extract unit price from M.R.P or RATE column
8. Extract total amount from AMOUNT column (rightmost column)
9. Extract total invoice amount from 'NET AMOUNT' or 'Total Due' field at bottom
10. Extract invoice date from invoice header
11. For each field, provide a confidence score between 0 and 1 (where 1 is 100% confident)
12. Be precise and extract all visible information. If a field is not visible, use empty string or null
13. Return ONLY valid JSON, no other text.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an OCR expert for extracting Purchase Order and GST Invoice data from images. Return only valid JSON with all fields properly populated."
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
              invoiceDate: { type: "string" },
              invoiceNumber: { type: "string" },
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
              totalValue: { type: "string" },
              confidence: {
                type: "object",
                properties: {
                  vendorName: { type: "number" },
                  vendorContactNumber: { type: "number" },
                  vendorGstNumber: { type: "number" },
                  vendorAddress: { type: "number" },
                  poToName: { type: "number" },
                  poToContactNumber: { type: "number" },
                  poToAddress: { type: "number" },
                  poToGstNumber: { type: "number" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "number" },
                        quantity: { type: "number" },
                        valuePerItem: { type: "number" },
                        totalValue: { type: "number" }
                      }
                    }
                  },
                  totalValue: { type: "number" }
                }
              }
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
