import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { downloadCsvFile } from "@/lib/downloadCsv";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

export default function PatientRecords() {
  const [searchQuery, setSearchQuery] = useState("");

  const patientsQuery = trpc.patients.getAll.useQuery();
  const exportPatientsCsv = trpc.patients.exportCsv.useMutation({
    onSuccess: (payload) => {
      downloadCsvFile(payload);
      toast.success(`Exported ${payload.rowCount} patient record(s) to CSV.`);
    },
    onError: (error) => {
      toast.error(error.message || "Unable to export patient records.");
    },
  });

  const patients = patientsQuery.data || [];

  const filteredPatients = patients.filter(p =>
    p.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.patientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patient Records</h1>
          <p className="text-muted-foreground mt-2">Search, review, and export patient history for external reporting</p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportPatientsCsv.mutate()}
          disabled={exportPatientsCsv.isPending}
          className="shadow-sm"
        >
          {exportPatientsCsv.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export Patients CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Patients</CardTitle>
          <CardDescription>Find patients by name or ID</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or patient ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline">Filter</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient List</CardTitle>
          <CardDescription>{filteredPatients.length} patient(s) found</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No patients found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Patient ID</th>
                    <th className="text-left py-3 px-4 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Contact</th>
                    <th className="text-left py-3 px-4 font-semibold">Email</th>
                    <th className="text-left py-3 px-4 font-semibold">Registered</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.patientId} className="border-b hover:bg-accent">
                      <td className="py-3 px-4 font-mono text-xs">{patient.patientId}</td>
                      <td className="py-3 px-4">{patient.firstName} {patient.lastName}</td>
                      <td className="py-3 px-4">{patient.contactNumber}</td>
                      <td className="py-3 px-4">{patient.email || "-"}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {new Date(patient.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Button variant="outline" size="sm">View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
