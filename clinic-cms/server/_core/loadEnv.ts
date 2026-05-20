import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clinicCmsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const envPath = path.join(clinicCmsRoot, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}
