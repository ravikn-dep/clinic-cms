import { readFileSync, writeFileSync } from "node:fs";

const pages = [
  "client/src/pages/PatientRegistration.tsx",
  "client/src/pages/PatientRecords.tsx",
  "client/src/pages/AmbientScribe.tsx",
  "client/src/pages/PharmacyInventory.tsx",
  "client/src/pages/Billing.tsx",
  "client/src/pages/Notifications.tsx",
  "client/src/pages/AuditLogs.tsx",
];

const replacements = [
  [/<div className="space-y-8">/g, '<div className="friendly-page space-y-8">'],
  [/<div className="space-y-6">/g, '<div className="friendly-page space-y-6">'],
  [/className="text-3xl font-bold tracking-tight"/g, 'className="text-3xl font-bold tracking-tight text-teal-950"'],
  [/className="text-4xl font-bold tracking-tight"/g, 'className="text-4xl font-bold tracking-tight text-teal-950"'],
  [/className="text-muted-foreground mt-2"/g, 'className="mt-2 max-w-2xl leading-6 text-muted-foreground"'],
  [/className="mt-2 text-muted-foreground"/g, 'className="mt-2 max-w-2xl leading-6 text-muted-foreground"'],
  [/Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md"/g, 'Card className="friendly-card"'],
  [/Card className="border-slate-200 shadow-sm"/g, 'Card className="friendly-card"'],
  [/Card className="border-slate-200 shadow-lg transition-shadow hover:shadow-xl"/g, 'Card className="friendly-card"'],
  [/Card className="border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"/g, 'Card className="friendly-card"'],
  [/Card className="border-slate-200 bg-white shadow-sm"/g, 'Card className="friendly-card"'],
  [/Card className="border-dashed"/g, 'Card className="friendly-card border-dashed border-teal-200 bg-teal-50/45"'],
  [/Card className="border-destructive\/30 bg-destructive\/5"/g, 'Card className="border-destructive/30 bg-destructive/5 shadow-sm"'],
  [/className="shadow-sm transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action"'],
  [/className="flex-1 shadow-sm transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action flex-1"'],
  [/className="w-full bg-white shadow-sm transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action w-full border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50"'],
  [/className="flex-1 bg-white shadow-sm transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action flex-1 border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50"'],
  [/className="bg-white shadow-sm transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action border-teal-200 bg-white/85 text-teal-800 hover:bg-teal-50"'],
  [/className="transition-all hover:-translate-y-0\.5 hover:shadow-md"/g, 'className="friendly-action"'],
  [/className="transition-all hover:-translate-y-0\.5"/g, 'className="transition-all hover:-translate-y-0.5 hover:text-teal-700"'],
  [/className="rounded-lg border p-4 transition-all hover:-translate-y-0\.5 hover:bg-accent hover:shadow-sm/g, 'className="rounded-3xl border border-white/80 bg-white/75 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-50 hover:shadow-md'],
  [/className="rounded border border-amber-200 bg-white p-3 transition-all hover:-translate-y-0\.5 hover:shadow-sm/g, 'className="rounded-3xl border border-amber-200 bg-white/85 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md'],
  [/className="text-sm font-medium text-muted-foreground"/g, 'className="text-sm font-medium text-muted-foreground"'],
];

for (const page of pages) {
  let source = readFileSync(page, "utf8");
  for (const [find, replace] of replacements) {
    source = source.replace(find, replace);
  }

  // Add a subtle friendly header treatment to common first header blocks without altering structure.
  source = source.replace(
    /<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">/g,
    '<div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">'
  );
  source = source.replace(
    /<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">/g,
    '<div className="friendly-hero flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">'
  );

  writeFileSync(page, source);
}
