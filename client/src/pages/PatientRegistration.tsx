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
    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the OPD tracking slip.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head><title>OPD Tracking Slip - ${registeredPatient.patientId}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 32px; color: #111827;">
          <div style="border: 1px solid #d1d5db; border-radius: 16px; padding: 24px; max-width: 520px; margin: 0 auto;">
            <h1 style="font-size: 22px; margin: 0 0 8px;">Clinic OPD Tracking Slip</h1>
            <p style="margin: 0 0 24px; color: #4b5563;">Use this QR code or barcode for patient queue tracking.</p>
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 20px;">Patient ID: ${registeredPatient.patientId}</div>
            ${registeredPatient.qrcodeImageUrl ? `<img src="${registeredPatient.qrcodeImageUrl}" style="width: 180px; height: 180px; display: block; margin-bottom: 20px;" />` : ""}
            ${registeredPatient.barcodeImageUrl ? `<img src="${registeredPatient.barcodeImageUrl}" style="width: 360px; max-width: 100%; display: block; margin-bottom: 12px;" />` : ""}
            <div style="font-family: monospace; font-size: 13px;">${registeredPatient.barcodeData}</div>
          </div>
          <script>window.onload = () => { window.print(); window.close(); };</script>
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
                <Button className="friendly-action flex-1" variant="default" onClick={printTrackingSlip}><Printer className="mr-2 h-4 w-4" />Print Slip</Button>
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
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">After successful registration, QR and barcode images will be shown for printing and external OPD tracking.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
