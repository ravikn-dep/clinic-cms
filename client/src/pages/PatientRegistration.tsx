import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, Printer, QrCode } from "lucide-react";

const registrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  contactNumber: z.string().min(10, "Contact number must be at least 10 digits"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

type RegisteredPatient = {
  success: boolean;
  patientId: string;
  barcodeData: string;
  barcodeImageUrl?: string;
  qrcodeImageUrl?: string;
  barcodeImageKey?: string;
  qrcodeImageKey?: string;
};

export default function PatientRegistration() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredPatient, setRegisteredPatient] = useState<RegisteredPatient | null>(null);
  const [registeredPatientDetails, setRegisteredPatientDetails] = useState<RegistrationFormData | null>(null);

  const { register, handleSubmit, formState: { errors }, setValue, reset } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const registerMutation = trpc.patients.register.useMutation();
  const artifactLink = trpc.files.getArtifactLink.useMutation({
    onError: (error) => {
      toast.error(error.message || "Unable to open the protected tracking asset.");
    },
  });

  const onSubmit = async (data: RegistrationFormData) => {
    try {
      setIsSubmitting(true);
      const result = await registerMutation.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        contactNumber: data.contactNumber,
        email: data.email || undefined,
        address: data.address,
      });

      setRegisteredPatient(result);
      setRegisteredPatientDetails(data);
      toast.success(`Patient ${data.firstName} ${data.lastName} registered successfully with stored QR and barcode assets.`);
      reset();
    } catch (error: any) {
      toast.error(error.message || "Failed to register patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTrackingAsset = async (artifactType: "barcode" | "qr_code") => {
    if (!registeredPatient) return;
    const isBarcode = artifactType === "barcode";
    const asset = await artifactLink.mutateAsync({
      key: isBarcode ? registeredPatient.barcodeImageKey : registeredPatient.qrcodeImageKey,
      url: isBarcode ? registeredPatient.barcodeImageUrl : registeredPatient.qrcodeImageUrl,
      artifactType,
      patientId: registeredPatient.patientId,
      recordId: registeredPatient.patientId,
    });
    window.open(asset.url, "_blank", "noopener,noreferrer");
    toast.success(`${isBarcode ? "Barcode" : "QR code"} opened through a protected, audited link.`);
  };

  const printTrackingSlip = () => {
    if (!registeredPatient) return;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the OP registration form.");
      return;
    }

    const patient = registeredPatientDetails;
    const escapeHtml = (value?: string | null) => String(value || "—")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "—";
    const generatedAt = new Date().toLocaleString();

    printWindow.document.write(`
      <html>
        <head>
          <title>A4 OP Registration Form - ${escapeHtml(registeredPatient.patientId)}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #ffffff; }
            .page { width: 186mm; min-height: 273mm; margin: 0 auto; border: 1px solid #111827; padding: 10mm; }
            .header { display: grid; grid-template-columns: 1fr 34mm 58mm; gap: 8mm; align-items: start; border-bottom: 2px solid #111827; padding-bottom: 7mm; }
            .clinic-title { font-size: 20px; font-weight: 800; letter-spacing: 0.02em; margin: 0 0 2mm; }
            .subtitle { margin: 0 0 6mm; font-size: 11px; color: #4b5563; }
            .patient-id { display: inline-block; border: 1px solid #111827; padding: 2mm 4mm; font-family: monospace; font-size: 15px; font-weight: 800; }
            .qr { width: 31mm; height: 31mm; object-fit: contain; border: 1px solid #d1d5db; padding: 1.5mm; }
            .barcode { width: 55mm; height: 24mm; object-fit: contain; border: 1px solid #d1d5db; padding: 1.5mm; }
            table { width: 100%; border-collapse: collapse; margin-top: 7mm; font-size: 11px; }
            th, td { border: 1px solid #111827; padding: 3mm; text-align: left; vertical-align: top; }
            th { width: 22%; background: #f3f4f6; font-weight: 700; }
            .section { margin-top: 9mm; border: 1px solid #111827; min-height: 40mm; }
            .section-title { border-bottom: 1px solid #111827; background: #f9fafb; padding: 3mm; font-weight: 800; font-size: 12px; }
            .blank-space { min-height: 41mm; }
            .footer { margin-top: 8mm; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; font-size: 11px; }
            .line { border-bottom: 1px solid #111827; height: 10mm; }
            @media print { body { background: #ffffff; } .page { border: 1px solid #111827; } }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="header">
              <div>
                <h1 class="clinic-title">Clinic OP Registration Form</h1>
                <p class="subtitle">Printable A4 form for OPD registration, consultation notes, treatment plan, and investigations.</p>
                <div class="patient-id">Patient ID: ${escapeHtml(registeredPatient.patientId)}</div>
              </div>
              <div>${registeredPatient.qrcodeImageUrl ? `<img class="qr" src="${escapeHtml(registeredPatient.qrcodeImageUrl)}" alt="QR code" />` : ""}</div>
              <div>
                ${registeredPatient.barcodeImageUrl ? `<img class="barcode" src="${escapeHtml(registeredPatient.barcodeImageUrl)}" alt="Barcode" />` : ""}
                <div style="font-family: monospace; font-size: 10px; margin-top: 2mm; word-break: break-all;">${escapeHtml(registeredPatient.barcodeData)}</div>
              </div>
            </section>

            <table aria-label="OP registration details">
              <tbody>
                <tr><th>Patient Name</th><td>${escapeHtml(patientName)}</td><th>Patient ID</th><td>${escapeHtml(registeredPatient.patientId)}</td></tr>
                <tr><th>Date of Birth</th><td>${escapeHtml(patient?.dateOfBirth)}</td><th>Gender</th><td>${escapeHtml(patient?.gender)}</td></tr>
                <tr><th>Contact Number</th><td>${escapeHtml(patient?.contactNumber)}</td><th>Generated On</th><td>${escapeHtml(generatedAt)}</td></tr>
                <tr><th>Consultant Name</th><td>&nbsp;</td><th>Consultation Date/Time</th><td>&nbsp;</td></tr>
                <tr><th>Address</th><td colspan="3">${escapeHtml(patient?.address)}</td></tr>
              </tbody>
            </table>

            <section class="section"><div class="section-title">Clinical History / Present Complaints</div><div class="blank-space"></div></section>
            <section class="section"><div class="section-title">Advised Investigations</div><div class="blank-space"></div></section>
            <section class="section"><div class="section-title">Treatment Plan / Prescription</div><div class="blank-space"></div></section>

            <div class="footer">
              <div><div class="line"></div><p>Patient / Attendant Signature</p></div>
              <div><div class="line"></div><p>Consultant Signature</p></div>
            </div>
          </main>
          <script>window.onload = () => setTimeout(() => { window.print(); window.close(); }, 350);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="friendly-page space-y-8">
      <div className="friendly-hero">
        <Badge className="friendly-chip border-teal-200 bg-teal-50 text-teal-800">Patient intake</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-teal-950">Patient Registration</h1>
        <p className="mt-2 max-w-3xl leading-6 text-muted-foreground">Welcome each patient with a calmer intake flow, auto-generate a unique Patient ID, and securely store QR/barcode assets for OPD tracking.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="friendly-card">
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Enter patient details to complete registration</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" placeholder="John" {...register("firstName")} className={`transition-colors ${errors.firstName ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                  {errors.firstName && <p className="text-sm text-red-500">{errors.firstName.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" placeholder="Doe" {...register("lastName")} className={`transition-colors ${errors.lastName ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                  {errors.lastName && <p className="text-sm text-red-500">{errors.lastName.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth *</Label>
                <Input id="dob" type="date" {...register("dateOfBirth")} className={`transition-colors ${errors.dateOfBirth ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                {errors.dateOfBirth && <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select onValueChange={(value: "Male" | "Female" | "Other") => setValue("gender", value)}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact">Contact Number *</Label>
                  <Input id="contact" placeholder="+1 (555) 000-0000" {...register("contactNumber")} className={`transition-colors ${errors.contactNumber ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                  {errors.contactNumber && <p className="text-sm text-red-500">{errors.contactNumber.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register("email")} className={`transition-colors ${errors.email ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" placeholder="Enter patient's address" {...register("address")} rows={3} className="transition-colors focus-visible:ring-teal-200" />
              </div>

              <Button type="submit" disabled={isSubmitting} className="friendly-action w-full bg-teal-600 text-white hover:bg-teal-700">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register Patient
              </Button>
            </form>
          </CardContent>
        </Card>

        {registeredPatient ? (
          <Card className="friendly-card border-green-200 bg-green-50/80">
            <CardHeader>
              <CardTitle className="text-green-950">Registration Successful</CardTitle>
              <CardDescription className="text-green-800">Patient ID, QR code, and barcode were generated and stored.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-green-950">Patient ID</Label>
                <div className="rounded-xl border-2 border-green-300 bg-white p-4 text-center font-mono text-lg font-bold">{registeredPatient.patientId}</div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/80 bg-white/85 p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <Label className="mb-3 block text-green-950">QR Code</Label>
                  {registeredPatient.qrcodeImageUrl ? <img src={registeredPatient.qrcodeImageUrl} alt={`QR code for ${registeredPatient.patientId}`} className="mx-auto h-40 w-40 rounded-lg border object-contain p-2" /> : <QrCode className="mx-auto h-20 w-20 text-slate-300" />}
                </div>
                <div className="rounded-3xl border border-white/80 bg-white/85 p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <Label className="mb-3 block text-green-950">Barcode</Label>
                  {registeredPatient.barcodeImageUrl ? <img src={registeredPatient.barcodeImageUrl} alt={`Barcode for ${registeredPatient.patientId}`} className="mx-auto h-32 w-full rounded-lg border object-contain p-2" /> : <p className="text-sm text-muted-foreground">Barcode unavailable</p>}
                </div>
              </div>

              <div className="rounded-3xl border border-white/80 bg-white/85 p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <Label className="text-green-950">Barcode Data</Label>
                <p className="mt-2 break-all font-mono text-sm">{registeredPatient.barcodeData}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="friendly-action flex-1" variant="default" onClick={printTrackingSlip}><Printer className="mr-2 h-4 w-4" />Print A4 OP Form</Button>
                {registeredPatient.qrcodeImageUrl && <Button className="friendly-action flex-1 border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50" variant="outline" disabled={artifactLink.isPending} onClick={() => openTrackingAsset("qr_code")}><Download className="mr-2 h-4 w-4" />QR Code</Button>}
                {registeredPatient.barcodeImageUrl && <Button className="friendly-action flex-1 border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50" variant="outline" disabled={artifactLink.isPending} onClick={() => openTrackingAsset("barcode")}><Download className="mr-2 h-4 w-4" />Barcode</Button>}
              </div>

              <Button className="friendly-action w-full border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50" variant="outline" onClick={() => { setRegisteredPatient(null); reset(); }}>Register Another Patient</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="friendly-card flex min-h-[420px] items-center justify-center border-dashed border-teal-200 bg-teal-50/45">
            <CardContent className="text-center">
              <QrCode className="mx-auto mb-4 h-12 w-12 text-teal-500" />
              <h2 className="text-xl font-semibold text-teal-950">OPD tracking assets appear here</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">After successful registration, QR and barcode images will be shown for printing the A4 OP registration form and external OPD tracking.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
