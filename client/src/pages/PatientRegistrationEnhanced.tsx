import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Printer, Download, Copy } from "lucide-react";

const registrationSchema = z.object({
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  contactNumber: z.string().min(10, "Valid phone number required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function PatientRegistrationEnhanced() {
  const [registeredPatient, setRegisteredPatient] = useState<any>(null);
  const [showQRCode, setShowQRCode] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const registerMutation = trpc.patients.registerWithBarcodes.useMutation();

  const onSubmit = async (data: RegistrationFormData) => {
    try {
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
      toast.success(`Patient ${result.patientId} registered successfully!`);
      reset();
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    }
  };

  const handlePrint = () => {
    if (!registeredPatient) return;
    window.print();
  };

  const handleDownloadQR = async () => {
    if (!registeredPatient?.qrCodeUrl) return;

    try {
      const response = await fetch(registeredPatient.qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${registeredPatient.patientId}-qr.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("QR code downloaded");
    } catch (error) {
      toast.error("Failed to download QR code");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patient Registration</h1>
        <p className="text-muted-foreground mt-2">Register a new patient and generate OPD tracking barcodes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registration Form */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Enter patient details to generate unique ID and barcodes</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    {...register("firstName")}
                    className={errors.firstName ? "border-red-500" : ""}
                  />
                  {errors.firstName && <p className="text-sm text-red-500">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    {...register("lastName")}
                    className={errors.lastName ? "border-red-500" : ""}
                  />
                  {errors.lastName && <p className="text-sm text-red-500">{errors.lastName.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth (YYYY-MM-DD) *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  {...register("dateOfBirth")}
                  className={errors.dateOfBirth ? "border-red-500" : ""}
                />
                {errors.dateOfBirth && <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select {...register("gender")}>
                  <SelectTrigger>
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
                <Input
                  id="contactNumber"
                  placeholder="+91 98765 43210"
                  {...register("contactNumber")}
                  className={errors.contactNumber ? "border-red-500" : ""}
                />
                {errors.contactNumber && <p className="text-sm text-red-500">{errors.contactNumber.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  {...register("email")}
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="123 Main Street, City"
                  {...register("address")}
                />
              </div>

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Registering..." : "Register Patient"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Registration Result */}
        {registeredPatient && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-900">✓ Registration Successful</CardTitle>
              <CardDescription className="text-green-800">Patient ID and barcodes generated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Patient ID</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-white p-3 rounded border font-mono text-lg font-bold">
                      {registeredPatient.patientId}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(registeredPatient.patientId);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* QR Code Display */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">QR Code for OPD Tracking</p>
                {showQRCode && registeredPatient.qrCodeUrl && (
                  <div className="bg-white p-4 rounded border flex flex-col items-center">
                    <img
                      src={registeredPatient.qrCodeUrl}
                      alt="Patient QR Code"
                      className="w-48 h-48"
                    />
                    <p className="text-xs text-muted-foreground mt-2">Scan for patient details</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowQRCode(!showQRCode)}
                >
                  {showQRCode ? "Hide" : "Show"} QR Code
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadQR}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download QR Code
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handlePrint}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print Registration Card
                </Button>
              </div>

              <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                <p className="font-medium mb-1">Next Steps:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Print the QR code for OPD tracking</li>
                  <li>Attach to patient file</li>
                  <li>Use for quick check-in during consultations</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
