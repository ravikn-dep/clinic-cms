import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const editSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  contactNumber: z.string().min(10, "Contact number must be at least 10 digits"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

export type PatientRecord = {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  contactNumber: string;
  email?: string | null;
  address?: string | null;
  isArchived?: boolean;
};

type PatientEditDialogProps = {
  patient: PatientRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function PatientEditDialog({
  patient,
  open,
  onOpenChange,
  onSaved,
}: PatientEditDialogProps) {
  const utils = trpc.useUtils();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  const gender = watch("gender");

  useEffect(() => {
    if (patient && open) {
      reset({
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth || "",
        gender: (patient.gender as EditFormData["gender"]) || undefined,
        contactNumber: patient.contactNumber,
        email: patient.email || "",
        address: patient.address || "",
      });
    }
  }, [patient, open, reset]);

  const updateMutation = trpc.patients.update.useMutation({
    onSuccess: async () => {
      toast.success("Patient updated successfully");
      await utils.patients.getAll.invalidate();
      await utils.patients.search.invalidate();
      if (patient) {
        await utils.patients.getById.invalidate({ patientId: patient.patientId });
      }
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update patient");
    },
  });

  const onSubmit = (data: EditFormData) => {
    if (!patient) return;
    updateMutation.mutate({
      patientId: patient.patientId,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      contactNumber: data.contactNumber,
      email: data.email || null,
      address: data.address || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit patient</DialogTitle>
          <DialogDescription>
            Update demographics for {patient?.patientId}. Changes are logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First name</Label>
              <Input id="edit-firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last name</Label>
              <Input id="edit-lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-dob">Date of birth</Label>
              <Input id="edit-dob" type="date" {...register("dateOfBirth")} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={gender || ""}
                onValueChange={(v) =>
                  setValue("gender", v as EditFormData["gender"], { shouldValidate: true })
                }
              >
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contact">Contact number</Label>
            <Input id="edit-contact" {...register("contactNumber")} />
            {errors.contactNumber && (
              <p className="text-sm text-destructive">{errors.contactNumber.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <Textarea id="edit-address" rows={2} {...register("address")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
