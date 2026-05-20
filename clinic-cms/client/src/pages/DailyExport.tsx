import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, FileText, Table } from "lucide-react";

export default function DailyExport() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [exportResult, setExportResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const exportMutation = trpc.dailyExport.exportDailyReport.useMutation();

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const result = await exportMutation.mutateAsync({ date: selectedDate });
      setExportResult(result);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to generate daily export. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Daily Data Export</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Daily Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Date</label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <Button
            onClick={handleExport}
            disabled={isLoading || exportMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {isLoading || exportMutation.isPending ? "Generating..." : "Generate Report"}
          </Button>
        </CardContent>
      </Card>

      {exportResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900">Export Successful</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-white p-4">
                <p className="text-sm text-gray-600">Patients Registered</p>
                <p className="text-2xl font-bold text-teal-600">
                  {exportResult.summary.patientsRegistered}
                </p>
              </div>
              <div className="rounded-lg bg-white p-4">
                <p className="text-sm text-gray-600">Consultations</p>
                <p className="text-2xl font-bold text-teal-600">
                  {exportResult.summary.consultationsCompleted}
                </p>
              </div>
              <div className="rounded-lg bg-white p-4">
                <p className="text-sm text-gray-600">Total Billing</p>
                <p className="text-2xl font-bold text-teal-600">
                  ₹{exportResult.summary.totalBilling.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Download Reports:</p>
              <div className="flex gap-3">
                <a href={exportResult.pdfUrl} download>
                  <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Download PDF
                  </Button>
                </a>
                <a href={exportResult.excelUrl} download>
                  <Button variant="outline" className="gap-2">
                    <Table className="h-4 w-4" />
                    Download Excel
                  </Button>
                </a>
              </div>
            </div>

            <div className="text-xs text-gray-600">
              <p>Report generated for: {exportResult.date}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Export Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <p>
            <strong>PDF Report:</strong> Includes clinic header, daily summary statistics, and detailed tables for patients, consultations, and billing records.
          </p>
          <p>
            <strong>Excel Report:</strong> Multi-sheet workbook with Summary, Patients, Consultations, Billing, and Inventory tabs for easy analysis and archival.
          </p>
          <p>
            <strong>Data Included:</strong> All patient registrations, consultations, billing records, and current inventory status for the selected date.
          </p>
          <p>
            <strong>Usage:</strong> Use this feature at End of Day (EoD) to generate daily reports for record-keeping, auditing, and analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
