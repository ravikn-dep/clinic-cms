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
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

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

export default function PatientRegistration() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredPatient, setRegisteredPatient] = useState<any>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const registerMutation = trpc.patients.register.useMutation();

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
      toast.success(`Patient ${data.firstName} ${data.lastName} registered successfully!`);
      reset();
    } catch (error: any) {
      toast.error(error.message || "Failed to register patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patient Registration</h1>
        <p className="text-muted-foreground mt-2">Register a new patient and generate OPD tracking barcode</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registration Form */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Enter patient details to complete registration</CardDescription>
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
                  {errors.firstName && (
                    <p className="text-sm text-red-500">{errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    {...register("lastName")}
                    className={errors.lastName ? "border-red-500" : ""}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-500">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth *</Label>
                <Input
                  id="dob"
                  type="date"
                  {...register("dateOfBirth")}
                  className={errors.dateOfBirth ? "border-red-500" : ""}
                />
                {errors.dateOfBirth && (
                  <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select defaultValue="">
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
                  <Label htmlFor="contact">Contact Number *</Label>
                  <Input
                    id="contact"
                    placeholder="+1 (555) 000-0000"
                    {...register("contactNumber")}
                    className={errors.contactNumber ? "border-red-500" : ""}
                  />
                  {errors.contactNumber && (
                    <p className="text-sm text-red-500">{errors.contactNumber.message}</p>
                  )}
                </div>
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
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter patient's address"
                  {...register("address")}
                  rows={3}
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Register Patient
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Success & Barcode Display */}
        {registeredPatient && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-900">✓ Registration Successful</CardTitle>
              <CardDescription className="text-green-800">Patient ID and barcode generated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-green-900">Patient ID</Label>
                <div className="p-4 bg-white border-2 border-green-300 rounded-lg font-mono text-lg font-bold text-center">
                  {registeredPatient.patientId}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-green-900">Barcode Data</Label>
                <div className="p-4 bg-white border rounded-lg text-center">
                  <p className="font-mono text-sm">{registeredPatient.barcodeData}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-green-900">QR Code / Barcode</Label>
                <div className="p-4 bg-white border rounded-lg flex items-center justify-center min-h-[200px]">
                  <div className="text-center">
                    <p className="text-muted-foreground mb-2">Barcode will be displayed here</p>
                    <p className="text-sm font-mono">{registeredPatient.barcodeData}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" variant="default">
                  Print Barcode
                </Button>
                <Button className="flex-1" variant="outline">
                  Download PDF
                </Button>
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setRegisteredPatient(null);
                  reset();
                }}
              >
                Register Another Patient
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
