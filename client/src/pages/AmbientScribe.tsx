import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, FileAudio, Mic, PenLine, ShieldCheck, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ParsedClinicalNote = {
  clinicalHistory: string;
  presentComplaints: string;
  advisedInvestigations: string;
  treatmentPlan: string;
};

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/x-m4a",
  "audio/m4a",
]);

function normalizeAudioMimeType(type: string) {
  return SUPPORTED_AUDIO_TYPES.has(type) ? type : "audio/webm";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, payload] = result.split(",");
      if (!payload) {
        reject(new Error("Unable to read audio payload"));
        return;
      }
      resolve(payload);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read audio file"));
    reader.readAsDataURL(file);
  });
}

export default function AmbientScribe() {
  const [patientId, setPatientId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedClinicalNote | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [audioStorageUrl, setAudioStorageUrl] = useState<string | null>(null);
  const [digitalSignature, setDigitalSignature] = useState("");
  const [isFinalized, setIsFinalized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const uploadAudio = trpc.consultations.uploadAudio.useMutation();
  const createConsultation = trpc.consultations.create.useMutation();
  const transcribeAndParse = trpc.consultations.transcribeAndParse.useMutation();
  const finalizeConsultation = trpc.consultations.finalize.useMutation();

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const recordedFile = new File([blob], `consultation-${Date.now()}.webm`, { type: "audio/webm" });
        setAudioFile(recordedFile);
        stream.getTracks().forEach((track) => track.stop());
        toast.success("Recording saved and ready for transcription");
      };

      recorder.start();
      setIsRecording(true);
      toast.info("Recording started. Capture only with patient consent.");
    } catch (error) {
      toast.error("Microphone access failed. Please upload an audio file instead.");
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Audio files must be 16MB or smaller for transcription.");
      return;
    }
    setAudioFile(file);
    setParsedData(null);
    setConsultationId(null);
    setAudioStorageUrl(null);
    setIsFinalized(false);
    toast.success(`File selected: ${file.name}`);
  };

  const handleTranscribeAndParse = async () => {
    if (!patientId || !audioFile) {
      toast.error("Please enter a patient ID and provide an audio file");
      return;
    }

    setIsProcessing(true);
    try {
      const base64Content = await fileToBase64(audioFile);
      const upload = await uploadAudio.mutateAsync({
        patientId,
        fileName: audioFile.name,
        mimeType: normalizeAudioMimeType(audioFile.type) as any,
        base64Content,
      });
      setAudioStorageUrl(upload.url);

      const consultation = await createConsultation.mutateAsync({
        patientId,
        audioFileUrl: upload.url,
        audioFileKey: upload.key,
      });
      setConsultationId(consultation.consultationId);

      const result = await transcribeAndParse.mutateAsync({
        consultationId: consultation.consultationId,
        audioUrl: upload.url,
      });
      setParsedData(result.parsedData as ParsedClinicalNote);
      toast.success("Clinical documentation parsed successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process audio");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalize = async () => {
    if (!consultationId || !digitalSignature.trim()) {
      toast.error("Please provide a digital signature before finalizing.");
      return;
    }
    try {
      await finalizeConsultation.mutateAsync({ consultationId, signature: digitalSignature.trim() });
      setIsFinalized(true);
      toast.success("Clinical note finalized with digital signature");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to finalize note");
    }
  };

  const isBusy = isProcessing || uploadAudio.isPending || createConsultation.isPending || transcribeAndParse.isPending;

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 p-8 text-white shadow-xl">
        <Badge className="bg-teal-400/20 text-teal-100 border-teal-300/30">Ambient clinical documentation</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Ambient Scribe</h1>
        <p className="mt-2 max-w-3xl text-slate-200">
          Record or upload a doctor-patient conversation, securely store the audio, transcribe it with Whisper, and parse the note into the required clinical sections.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-lg transition-shadow hover:shadow-xl">
          <CardHeader>
            <CardTitle>Audio Input</CardTitle>
            <CardDescription>Live recording and uploaded files are stored before transcription for reliable retrieval.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID *</Label>
              <Input id="patientId" placeholder="e.g., PAT-ABC12345" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="transition-colors focus-visible:ring-teal-200" />
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">Live Recording</Label>
                <Button onClick={isRecording ? handleStopRecording : handleStartRecording} className="w-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" variant={isRecording ? "destructive" : "default"}>
                  <Mic className="mr-2 h-4 w-4" />
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </Button>
                {isRecording && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <span className="mr-2 animate-pulse">●</span>Recording in progress...
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
              </div>

              <div>
                <Label className="mb-3 block">Upload Audio File</Label>
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center shadow-inner transition-all hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-50/40 hover:shadow-md">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <Label htmlFor="audioFile" className="cursor-pointer">
                    <span className="text-sm font-medium">Click to upload</span>
                    <span className="mt-1 block text-xs text-muted-foreground">MP3, WAV, M4A, OGG, WEBM (Max 16MB)</span>
                  </Label>
                  <Input id="audioFile" type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                </div>
                {audioFile && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-green-700">
                    <FileAudio className="h-4 w-4" />{audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {audioStorageUrl && <p className="mt-1 text-xs text-muted-foreground">Stored securely at: {audioStorageUrl}</p>}
              </div>
            </div>

            <Button onClick={handleTranscribeAndParse} disabled={isBusy || !patientId || !audioFile} className="w-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:hover:translate-y-0" size="lg">
              {isBusy ? "Uploading, transcribing, and parsing..." : "Transcribe & Parse"}
            </Button>
          </CardContent>
        </Card>

        {parsedData ? (
          <Card className="border-emerald-200 bg-emerald-50 shadow-lg transition-shadow hover:shadow-xl">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-emerald-950">Clinical Documentation</CardTitle>
                  <CardDescription className="text-emerald-800">Auto-parsed from the stored audio transcript</CardDescription>
                </div>
                {isFinalized && <Badge className="bg-emerald-700"><ShieldCheck className="mr-1 h-3 w-3" />Finalized</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ClinicalSection label="Clinical History" value={parsedData.clinicalHistory} />
              <ClinicalSection label="Present Complaints" value={parsedData.presentComplaints} />
              <ClinicalSection label="Advised Investigations" value={parsedData.advisedInvestigations} />
              <ClinicalSection label="Treatment Plan" value={parsedData.treatmentPlan} />

              <div className="rounded-xl border bg-white p-4">
                <Label htmlFor="signature" className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><PenLine className="h-4 w-4" />Digital Signature</Label>
                <Textarea id="signature" placeholder="Type doctor's name and credentials to finalize this note" value={digitalSignature} onChange={(e) => setDigitalSignature(e.target.value)} disabled={isFinalized} className="transition-colors focus-visible:ring-teal-200" />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:hover:translate-y-0" onClick={handleFinalize} disabled={isFinalized || finalizeConsultation.isPending || !digitalSignature.trim()}>
                  <Check className="mr-2 h-4 w-4" />{isFinalized ? "Finalized" : "Finalize & Sign"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 bg-slate-50/80 shadow-lg transition-shadow hover:shadow-xl">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <Mic className="mb-4 h-12 w-12 text-slate-400" />
              <h2 className="text-xl font-semibold text-slate-900">No clinical note generated yet</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Upload or record audio, then run transcription. The generated note will appear here in the four required clinical sections.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ClinicalSection({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="mb-2 block font-semibold text-emerald-950">{label}</Label>
      <div className="rounded-xl border bg-white p-3 text-sm leading-6 text-slate-800 shadow-sm transition-colors hover:bg-emerald-50/50">{value || "Not documented"}</div>
    </div>
  );
}
