# Remaining TODO Audit
Wed Apr 29 11:27:02 UTC 2026

## Open TODO Items
16:- [ ] Real-time updates for queue and alerts
23:- [ ] Store audio files in cloud storage
43:- [ ] Patient profile page with visit history
44:- [ ] Display past consultations and clinical notes
45:- [ ] Show billing records per patient
46:- [ ] Link to stored audio files and PDFs
62:- [ ] S3 integration for audio files
63:- [ ] S3 integration for PDF invoices
64:- [ ] S3 integration for barcode/QR code images
65:- [ ] Save storage keys in database
66:- [ ] Implement secure file retrieval
69:- [ ] Encrypt sensitive data at rest (AES-256)
70:- [ ] Enforce TLS 1.3 for all communications
71:- [ ] Role-based access control (admin/user)
72:- [ ] Audit trail for all PHI access
73:- [ ] Secure session management
76:- [ ] Elegant, refined typography and color scheme
77:- [ ] Polished shadcn/ui components throughout
78:- [ ] Responsive design (mobile, tablet, desktop)
79:- [ ] Loading states and error handling
80:- [ ] Empty states with helpful guidance
81:- [ ] Micro-interactions and smooth transitions
91:- [ ] Final checkpoint before deployment
92:- [ ] Deploy to production
93:- [ ] Verify all features working end-to-end
94:- [ ] Generate working URL for user
95:- [ ] Create user documentation

## Storage Usage
server/_core/imageGeneration.ts:18:import { storagePut } from "server/storage";
server/_core/imageGeneration.ts:84:  const { url } = await storagePut(
server/routers.ts:8:import { storagePut } from "./storage";
server/routers.ts:145:        audioFileUrl: z.string().optional(),
server/routers.ts:146:        audioFileKey: z.string().optional(),
server/routers.ts:154:          audioFileUrl: input.audioFileUrl,
server/routers.ts:155:          audioFileKey: input.audioFileKey,
server/routers.ts:512:        { header: "Invoice PDF URL", value: (row) => row.invoicePdfUrl },
server/storage.ts:31:export async function storagePut(
server/storage.ts:74:export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
server/storage.ts:79:export async function storageGetSignedUrl(relKey: string): Promise<string> {
server/barcode.ts:57:    const barcodeImage = generateBarcodeImage(patientId);
server/barcode.ts:61:      barcodeImage,
server/invoice.ts:2:import { storagePut } from "./storage";
server/invoice.ts:174:    const fileKey = `invoices/${invoiceData.billId}.pdf`;
server/invoice.ts:175:    const { url, key } = await storagePut(fileKey, pdfBuffer, "application/pdf");
server/routers-enhanced.ts:7:import { storagePut } from "./storage";
server/routers-enhanced.ts:38:      const { url: qrCodeUrl, key: qrCodeKey } = await storagePut(
server/routers-enhanced.ts:167:        invoicePdfUrl: invoiceUrl,
server/routers-enhanced.ts:168:        invoicePdfKey: invoiceKey,
server/barcode.test.ts:47:      expect(barcodes).toHaveProperty("barcodeImage");
server/barcode.test.ts:59:      expect(barcodes.barcodeImage).toContain("<svg");
client/src/pages/AmbientScribe.tsx:14:  const [audioFile, setAudioFile] = useState<File | null>(null);
client/src/pages/AmbientScribe.tsx:37:    if (!patientId || !audioFile) {
client/src/pages/AmbientScribe.tsx:118:                  <Label htmlFor="audioFile" className="cursor-pointer">
client/src/pages/AmbientScribe.tsx:124:                    id="audioFile"
client/src/pages/AmbientScribe.tsx:131:                {audioFile && (
client/src/pages/AmbientScribe.tsx:134:                    {audioFile.name}
client/src/pages/AmbientScribe.tsx:142:              disabled={isProcessing || !patientId || !audioFile}
drizzle/meta/0001_snapshot.json:225:        "invoicePdfUrl": {
drizzle/meta/0001_snapshot.json:226:          "name": "invoicePdfUrl",
drizzle/meta/0001_snapshot.json:232:        "invoicePdfKey": {
drizzle/meta/0001_snapshot.json:233:          "name": "invoicePdfKey",
drizzle/meta/0001_snapshot.json:295:        "audioFileUrl": {
drizzle/meta/0001_snapshot.json:296:          "name": "audioFileUrl",
drizzle/meta/0001_snapshot.json:302:        "audioFileKey": {
drizzle/meta/0001_snapshot.json:303:          "name": "audioFileKey",
drizzle/meta/0001_snapshot.json:617:        "barcodeImageUrl": {
drizzle/meta/0001_snapshot.json:618:          "name": "barcodeImageUrl",
drizzle/schema.ts:39:  barcodeImageUrl: text("barcodeImageUrl"),
drizzle/schema.ts:53:  audioFileUrl: text("audioFileUrl"),
drizzle/schema.ts:54:  audioFileKey: text("audioFileKey"),
drizzle/schema.ts:96:  invoicePdfUrl: text("invoicePdfUrl"),
drizzle/schema.ts:97:  invoicePdfKey: text("invoicePdfKey"),
drizzle/0001_worried_rick_jones.sql:35:	`invoicePdfUrl` text,
drizzle/0001_worried_rick_jones.sql:36:	`invoicePdfKey` text,
drizzle/0001_worried_rick_jones.sql:46:	`audioFileUrl` text,
drizzle/0001_worried_rick_jones.sql:47:	`audioFileKey` text,
drizzle/0001_worried_rick_jones.sql:95:	`barcodeImageUrl` text,

## Patient Detail / History Usage
server/db.ts:102:export async function getPatientById(patientId: string) {
server/db.ts:148:  return db.select().from(consultations).where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.consultationDate));
server/db.ts:219:  return db.select().from(bills).where(eq(bills.patientId, patientId)).orderBy(desc(bills.createdAt));
server/routers.ts:46:        const existingPatient = await db.getPatientById(patientId);
server/routers.ts:130:        return db.getPatientById(input.patientId);
server/routers.ts:288:    getByPatientId: protectedProcedure
server/routers.ts:456:          content: `Invoice ${billId} has been generated for patient ${input.patientId}. Amount: ${finalAmount}`,
server/routers.ts:471:    getByPatientId: protectedProcedure
server/routers.ts:481:          const patient = await db.getPatientById(bill.patientId);
server/routers-enhanced.ts:28:      const existingPatient = await db.getPatientById(patientId);
server/routers-enhanced.ts:187:        content: `Invoice ${billId} generated for ${input.patientName}. Amount: ₹${finalAmount.toFixed(2)}`,
client/src/pages/Billing.tsx:202:                        <p className="font-medium">{bill.patientName}</p>
client/src/pages/Billing.tsx:203:                        <p className="text-xs text-muted-foreground">{bill.patientId}</p>
