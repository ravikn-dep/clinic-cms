import { useState } from "react";
import { BookAppointmentModal } from "@/components/BookAppointmentModal";
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
import { generateOPFormHTML } from "@/lib/opFormGenerator";


const registrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  age: z.string().min(1, "Age is required"),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  contactNumber: z.string().min(10, "Contact number must be at least 10 digits"),
  email: z.string().optional(),
  address: z.string().optional(),
  consultantName: z.string().optional(),
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
  const getFormTemplate = trpc.opForm.getTemplate.useQuery();
  const artifactLink = trpc.files.getArtifactLink.useMutation({
    onError: (error) => {
      toast.error(error.message || "Unable to open the protected tracking asset.");
    },
  });

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    try {
      const result = await registerMutation.mutateAsync(data);
      setRegisteredPatient(result as RegisteredPatient);
      setRegisteredPatientDetails(data);
      toast.success(`Patient registered successfully! ID: ${result.patientId}`);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const printTrackingSlip = () => {
    if (!registeredPatient || !registeredPatientDetails || !getFormTemplate.data) return;

    const printWindow = window.open("", "", "width=800,height=600");
    if (!printWindow) {
      toast.error("Unable to open print window. Please check your browser settings.");
      return;
    }

    const htmlContent = generateOPFormHTML(
      getFormTemplate.data,
      registeredPatientDetails,
      registeredPatient
    );

    printWindow.document.write(htmlContent);
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
                <Label htmlFor="age">Age *</Label>
                <div className="flex items-center gap-2">
                  <Input id="age" type="number" placeholder="30" {...register("age")} className="focus-visible:ring-teal-200" />
                  <span className="text-sm font-medium text-slate-600">years</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select onValueChange={(value) => setValue("gender", value as "Male" | "Female" | "Other")}>
                    <SelectTrigger id="gender" className="focus-visible:ring-teal-200">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Contact Number *</Label>
                  <Input id="contactNumber" placeholder="+91 9876543210" {...register("contactNumber")} className={`transition-colors ${errors.contactNumber ? "border-red-500 focus-visible:ring-red-200" : "focus-visible:ring-teal-200"}`} />
                  {errors.contactNumber && <p className="text-sm text-red-500">{errors.contactNumber.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register("email")} className="focus-visible:ring-teal-200" />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address (Optional)</Label>
                <Textarea id="address" placeholder="Enter patient address" {...register("address")} className="focus-visible:ring-teal-200" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consultantName">Consultant Name (Optional)</Label>
                <Select onValueChange={(value) => setValue("consultantName", value)}>
                  <SelectTrigger className="focus-visible:ring-teal-200">
                    <SelectValue placeholder="Select consultant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dr. Ravi N.">Dr. Ravi N.</SelectItem>
                    <SelectItem value="Dr. Deepthi">Dr. Deepthi</SelectItem>
                    <SelectItem value="Dr. Sharma">Dr. Sharma</SelectItem>
                    <SelectItem value="Dr. Patel">Dr. Patel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full bg-teal-600 hover:bg-teal-700">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Registering..." : "Register Patient"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {registeredPatient ? (
            <Card className="friendly-card border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">Registration Successful!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-green-300 bg-white p-4">
                  <p className="text-sm text-slate-600">Patient ID</p>
                  <p className="font-mono text-2xl font-bold text-green-700">{registeredPatient.patientId}</p>
                </div>

                {registeredPatient.qrcodeImageUrl && (
                  <div className="rounded-lg border border-green-300 bg-white p-4">
                    <p className="mb-2 text-sm font-medium text-slate-600">QR Code</p>
                    <img src={registeredPatient.qrcodeImageUrl} alt="QR Code" className="h-32 w-32 rounded" />
                  </div>
                )}

                {registeredPatient.barcodeImageUrl && (
                  <div className="rounded-lg border border-green-300 bg-white p-4">
                    <p className="mb-2 text-sm font-medium text-slate-600">Barcode</p>
                    <img src={registeredPatient.barcodeImageUrl} alt="Barcode" className="h-16 w-full rounded" />
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Next Steps:</p>
                  <Button onClick={printTrackingSlip} className="w-full gap-2 bg-teal-600 hover:bg-teal-700">
                    <Printer className="h-4 w-4" />
                    Generate OP Form
                  </Button>
                </div>

                <div className="border-t border-green-200 pt-4">
                  <p className="mb-3 text-sm font-medium text-slate-700">Would you like to book an appointment?</p>
                  <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => {
                    window.location.href = `/appointments?patientId=${registeredPatient.patientId}&action=book`;
                  }}>
                    Book Appointment Now
                  </Button>
                  <Button variant="outline" className="w-full mt-2" onClick={() => {
                    setRegisteredPatient(null);
                    setRegisteredPatientDetails(null);
                  }}>
                    Skip for Now
                  </Button>
                </div>

                <Button onClick={() => { setRegisteredPatient(null); setRegisteredPatientDetails(null); }} variant="outline" className="w-full">
                  Register Another Patient
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="friendly-card">
              <CardHeader>
                <CardTitle>Registration Status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Fill in the patient details and click "Register Patient" to generate a unique ID and QR code.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
