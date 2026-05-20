import { drizzle } from "drizzle-orm/mysql2";
import { billTemplates } from "../drizzle/schema.js";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;

async function seedTemplates() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  const predefinedTemplates = [
    {
      templateId: "TPL-CONSULTATION",
      name: "Consultation",
      description: "Standard consultation fee",
      itemsJson: JSON.stringify([
        {
          itemType: "Consultation",
          description: "Consultation Fee",
          quantity: 1,
          unitPrice: "500",
        },
      ]),
      createdBy: 1,
    },
    {
      templateId: "TPL-IMAGING",
      name: "Imaging",
      description: "Imaging and diagnostic tests",
      itemsJson: JSON.stringify([
        {
          itemType: "Procedure",
          description: "X-Ray",
          quantity: 1,
          unitPrice: "300",
        },
        {
          itemType: "Procedure",
          description: "Ultrasound",
          quantity: 1,
          unitPrice: "400",
        },
      ]),
      createdBy: 1,
    },
    {
      templateId: "TPL-PROCEDURE",
      name: "Procedure",
      description: "Procedure with consultation",
      itemsJson: JSON.stringify([
        {
          itemType: "Consultation",
          description: "Consultation Fee",
          quantity: 1,
          unitPrice: "500",
        },
        {
          itemType: "Procedure",
          description: "Procedure Charges",
          quantity: 1,
          unitPrice: "2000",
        },
      ]),
      createdBy: 1,
    },
    {
      templateId: "TPL-FOLLOWUP",
      name: "Follow-up",
      description: "Follow-up consultation",
      itemsJson: JSON.stringify([
        {
          itemType: "Consultation",
          description: "Follow-up Consultation",
          quantity: 1,
          unitPrice: "300",
        },
      ]),
      createdBy: 1,
    },
    {
      templateId: "TPL-COMBINED",
      name: "Combined",
      description: "Consultation with imaging and procedure",
      itemsJson: JSON.stringify([
        {
          itemType: "Consultation",
          description: "Consultation Fee",
          quantity: 1,
          unitPrice: "500",
        },
        {
          itemType: "Procedure",
          description: "X-Ray",
          quantity: 1,
          unitPrice: "300",
        },
        {
          itemType: "Procedure",
          description: "Procedure Charges",
          quantity: 1,
          unitPrice: "2000",
        },
      ]),
      createdBy: 1,
    },
  ];

  try {
    for (const template of predefinedTemplates) {
      await db.insert(billTemplates).values(template).catch(() => {
        // Ignore duplicates
      });
    }
    console.log("✓ Pre-defined templates seeded successfully");
  } catch (error) {
    console.error("Error seeding templates:", error);
  } finally {
    await connection.end();
  }
}

seedTemplates();
