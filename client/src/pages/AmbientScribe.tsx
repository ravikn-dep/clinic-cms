import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mic, Upload, Check } from "lucide-react";

export default function AmbientScribe() {
  const [patientId, setPatientId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStartRecording = () => {
    setIsRecording(true);
    toast.info("Recording started...");
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    toast.success("Recording stopped");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      toast.success(`File selected: ${file.name}`);
    }
  };

  const handleTranscribeAndParse = async () => {
    if (!patientId || !audioFile) {
      toast.error("Please select a patient and upload an audio file");
      return;
    }

    setIsProcessing(true);
    try {
      // Mock parsed data for demo
      setParsedData({
        clinicalHistory: "Patient has history of hypertension and diabetes mellitus type 2 for past 5 years.",
        presentComplaints: "Complains of persistent headache for 3 days, mild fever, and body aches.",
        advisedInvestigations: "Blood pressure monitoring, Fasting blood glucose, Complete blood count (CBC), Chest X-ray if fever persists.",
        treatmentPlan: "Prescribed Paracetamol 500mg twice daily for 5 days, advised bed rest, increase fluid intake. Follow-up in 1 week.",
      });
      toast.success("Clinical documentation parsed successfully");
    } catch (error) {
      toast.error("Failed to process audio");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ambient Scribe</h1>
        <p className="text-muted-foreground mt-2">Record or upload audio, transcribe, and auto-parse clinical documentation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Audio Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Audio Input</CardTitle>
            <CardDescription>Record live or upload pre-recorded audio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID *</Label>
              <Input
                id="patientId"
                placeholder="e.g., PAT-ABC12345"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">Live Recording</Label>
                <Button
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  className="w-full"
                  variant={isRecording ? "destructive" : "default"}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </Button>
                {isRecording && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 flex items-center gap-2">
                      <span className="animate-pulse">●</span>
                      Recording in progress...
                    </p>
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Upload Audio File</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <Label htmlFor="audioFile" className="cursor-pointer">
                    <span className="text-sm font-medium">Click to upload</span>
                    <span className="text-xs text-muted-foreground block mt-1">or drag and drop</span>
                    <span className="text-xs text-muted-foreground">MP3, WAV, M4A (Max 16MB)</span>
                  </Label>
                  <Input
                    id="audioFile"
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                {audioFile && (
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    {audioFile.name}
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={handleTranscribeAndParse}
              disabled={isProcessing || !patientId || !audioFile}
              className="w-full"
              size="lg"
            >
              {isProcessing ? "Processing..." : "Transcribe & Parse"}
            </Button>
          </CardContent>
        </Card>

        {/* Parsed Clinical Documentation */}
        {parsedData && (
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">✓ Clinical Documentation</CardTitle>
                <CardDescription className="text-green-800">Auto-parsed from audio transcript</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-green-900 font-semibold mb-2 block">Clinical History</Label>
                  <div className="p-3 bg-white border rounded-lg text-sm">
                    {parsedData.clinicalHistory}
                  </div>
                </div>

                <div>
                  <Label className="text-green-900 font-semibold mb-2 block">Present Complaints</Label>
                  <div className="p-3 bg-white border rounded-lg text-sm">
                    {parsedData.presentComplaints}
                  </div>
                </div>

                <div>
                  <Label className="text-green-900 font-semibold mb-2 block">Advised Investigations</Label>
                  <div className="p-3 bg-white border rounded-lg text-sm">
                    {parsedData.advisedInvestigations}
                  </div>
                </div>

                <div>
                  <Label className="text-green-900 font-semibold mb-2 block">Treatment Plan</Label>
                  <div className="p-3 bg-white border rounded-lg text-sm">
                    {parsedData.treatmentPlan}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" variant="default">
                    Finalize & Sign
                  </Button>
                  <Button className="flex-1" variant="outline">
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
