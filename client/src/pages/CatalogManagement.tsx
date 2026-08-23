import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, ClipboardList, Loader2, PackagePlus, Search, Tag, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type CatalogForm = {
  canonicalName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  hsnCode: string;
  gstRate: string;
};

const emptyCatalogForm: CatalogForm = {
  canonicalName: "",
  genericName: "",
  brandName: "",
  strength: "",
  dosageForm: "",
  manufacturer: "",
  hsnCode: "",
  gstRate: "",
};

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function catalogFormFromItem(item: any): CatalogForm {
  return {
    canonicalName: item.canonicalName ?? "",
    genericName: item.genericName ?? "",
    brandName: item.brandName ?? "",
    strength: item.strength ?? "",
    dosageForm: item.dosageForm ?? "",
    manufacturer: item.manufacturer ?? "",
    hsnCode: item.hsnCode ?? "",
    gstRate: item.gstRate == null ? "" : String(item.gstRate),
  };
}

export default function CatalogManagement() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(emptyCatalogForm);
  const [aliasText, setAliasText] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [aliasSource, setAliasSource] = useState<"MANUAL_CURATED" | "VENDOR_CURATED">("MANUAL_CURATED");

  const itemsQuery = trpc.catalogAdmin.listItems.useQuery({ query: query || undefined, includeInactive: true });
  const vendorsQuery = trpc.catalogAdmin.listVendors.useQuery();
  const aliasesQuery = trpc.catalogAdmin.listAliases.useQuery(
    { catalogItemId: selectedItemId ?? "not-selected", includeInactive: true },
    { enabled: Boolean(selectedItemId) },
  );

  const selectedItem = useMemo(
    () => itemsQuery.data?.find((item) => item.catalogItemId === selectedItemId) ?? null,
    [itemsQuery.data, selectedItemId],
  );

  useEffect(() => {
    if (selectedItem) setCatalogForm(catalogFormFromItem(selectedItem));
  }, [selectedItem]);

  const refresh = async () => {
    await Promise.all([
      utils.catalogAdmin.listItems.invalidate(),
      utils.catalogAdmin.listAliases.invalidate(),
      utils.catalogMatching.suggestMatches.invalidate(),
    ]);
  };

  const createItem = trpc.catalogAdmin.createItem.useMutation({
    onSuccess: async (item) => {
      toast.success("Catalog item created for future curated matching.");
      setSelectedItemId(item.catalogItemId);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateItem = trpc.catalogAdmin.updateItem.useMutation({
    onSuccess: async () => {
      toast.success("Catalog metadata updated. Historical PO descriptions were not changed.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const setItemActive = trpc.catalogAdmin.setItemActive.useMutation({
    onSuccess: async (_item, variables) => {
      toast.success(variables.active ? "Catalog item reactivated." : "Catalog item deactivated from future suggestions.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const createAlias = trpc.catalogAdmin.createAlias.useMutation({
    onSuccess: async () => {
      toast.success("Curated alias created for future suggestions.");
      setAliasText("");
      setVendorId("");
      setAliasSource("MANUAL_CURATED");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const setAliasActive = trpc.catalogAdmin.setAliasActive.useMutation({
    onSuccess: async (_alias, variables) => {
      toast.success(variables.active ? "Alias reactivated." : "Alias deactivated from future suggestions.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const itemPayload = () => ({
    canonicalName: catalogForm.canonicalName.trim(),
    genericName: toNullable(catalogForm.genericName),
    brandName: toNullable(catalogForm.brandName),
    strength: toNullable(catalogForm.strength),
    dosageForm: toNullable(catalogForm.dosageForm),
    manufacturer: toNullable(catalogForm.manufacturer),
    hsnCode: toNullable(catalogForm.hsnCode),
    gstRate: catalogForm.gstRate.trim() === "" ? null : Number(catalogForm.gstRate),
  });

  const submitItem = async (event: FormEvent) => {
    event.preventDefault();
    const payload = itemPayload();
    if (!payload.canonicalName) return toast.error("Canonical name is required.");
    if (payload.gstRate !== null && !Number.isFinite(payload.gstRate)) return toast.error("GST rate must be a valid number.");

    if (selectedItem) {
      await updateItem.mutateAsync({ catalogItemId: selectedItem.catalogItemId, updates: payload });
    } else {
      await createItem.mutateAsync(payload);
    }
  };

  const submitAlias = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedItemId) return toast.error("Select a catalog item before creating an alias.");
    await createAlias.mutateAsync({
      catalogItemId: selectedItemId,
      aliasText: aliasText.trim(),
      vendorId: vendorId || undefined,
      source: aliasSource,
    });
  };

  const busy = createItem.isPending || updateItem.isPending || setItemActive.isPending || createAlias.isPending || setAliasActive.isPending;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Admin / Settings</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Catalog Management</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Curate canonical supplier catalog identities and explicit aliases. These changes affect only future matching suggestions; they never rewrite purchase orders, evidence, goods receipts, inventory, or stock movements.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-teal-200 bg-teal-50 px-3 py-1 text-teal-800">Admin-governed reference data</Badge>
      </div>

      <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-900">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Aliases are created only through this explicit form. OCR, parser results, accepted PO matches, and PO submission never learn or create aliases automatically.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="items">Catalog items</TabsTrigger>
          <TabsTrigger value="aliases" disabled={!selectedItemId}>Aliases{selectedItem ? ` · ${selectedItem.canonicalName}` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Canonical catalog identities</CardTitle>
                    <CardDescription>Active and inactive records remain visible to administrators for historical-reference review.</CardDescription>
                  </div>
                  <Button type="button" variant="outline" onClick={() => { setSelectedItemId(null); setCatalogForm(emptyCatalogForm); }}>
                    <PackagePlus className="mr-2 h-4 w-4" /> New item
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search canonical, generic, brand, or manufacturer" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {itemsQuery.isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalog items…</div> : null}
                {itemsQuery.data?.map((item) => (
                  <button
                    key={item.catalogItemId}
                    type="button"
                    onClick={() => setSelectedItemId(item.catalogItemId)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedItemId === item.catalogItemId ? "border-teal-400 bg-teal-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.canonicalName}</p>
                        <p className="mt-1 text-xs text-slate-500">{[item.genericName, item.brandName, item.strength, item.dosageForm].filter(Boolean).join(" · ") || "No optional metadata"}</p>
                      </div>
                      <Badge variant={Boolean(item.active) ? "default" : "secondary"}>{Boolean(item.active) ? "Active" : "Inactive"}</Badge>
                    </div>
                  </button>
                ))}
                {!itemsQuery.isLoading && itemsQuery.data?.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No catalog items match this search.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedItem ? "Edit catalog item" : "Create catalog item"}</CardTitle>
                <CardDescription>Normalization is derived on the server. Strength, dosage form, release notation, and other typed identity details are retained exactly as entered.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitItem}>
                  <Field label="Canonical name" required><Input value={catalogForm.canonicalName} onChange={(event) => setCatalogForm({ ...catalogForm, canonicalName: event.target.value })} placeholder="e.g. Paracetamol 650 mg Tablet" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Generic name"><Input value={catalogForm.genericName} onChange={(event) => setCatalogForm({ ...catalogForm, genericName: event.target.value })} /></Field>
                    <Field label="Brand name"><Input value={catalogForm.brandName} onChange={(event) => setCatalogForm({ ...catalogForm, brandName: event.target.value })} /></Field>
                    <Field label="Strength"><Input value={catalogForm.strength} onChange={(event) => setCatalogForm({ ...catalogForm, strength: event.target.value })} placeholder="e.g. 650 mg" /></Field>
                    <Field label="Dosage form"><Input value={catalogForm.dosageForm} onChange={(event) => setCatalogForm({ ...catalogForm, dosageForm: event.target.value })} placeholder="e.g. Tablet" /></Field>
                    <Field label="Manufacturer"><Input value={catalogForm.manufacturer} onChange={(event) => setCatalogForm({ ...catalogForm, manufacturer: event.target.value })} /></Field>
                    <Field label="HSN code"><Input value={catalogForm.hsnCode} onChange={(event) => setCatalogForm({ ...catalogForm, hsnCode: event.target.value })} /></Field>
                    <Field label="GST rate (%)"><Input inputMode="decimal" value={catalogForm.gstRate} onChange={(event) => setCatalogForm({ ...catalogForm, gstRate: event.target.value })} /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>{(createItem.isPending || updateItem.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{selectedItem ? "Save metadata" : "Create catalog item"}</Button>
                    {selectedItem ? <Button type="button" variant="outline" disabled={busy} onClick={() => setItemActive.mutate({ catalogItemId: selectedItem.catalogItemId, active: !Boolean(selectedItem.active) })}>{Boolean(selectedItem.active) ? <Archive className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{Boolean(selectedItem.active) ? "Deactivate" : "Reactivate"}</Button> : null}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="aliases" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Explicit aliases</CardTitle>
                <CardDescription>Global aliases are intentionally shown as global. Vendor-scoped aliases remain visible only with their associated vendor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {aliasesQuery.isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading aliases…</div> : null}
                {aliasesQuery.data?.map((alias) => (
                  <div key={alias.aliasId} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{alias.aliasText}</p>
                        <p className="mt-1 text-xs text-slate-500">{alias.vendorId ? `Vendor-specific · ${alias.vendorName ?? alias.vendorId}` : "Global alias"} · {alias.source.replace("_", " ")}</p>
                      </div>
                      <div className="flex items-center gap-2"><Badge variant={Boolean(alias.active) ? "default" : "secondary"}>{Boolean(alias.active) ? "Active" : "Inactive"}</Badge><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAliasActive.mutate({ aliasId: alias.aliasId, active: !Boolean(alias.active) })}>{Boolean(alias.active) ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</Button></div>
                    </div>
                  </div>
                ))}
                {!aliasesQuery.isLoading && aliasesQuery.data?.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No aliases have been curated for this catalog item.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create explicit alias</CardTitle>
                <CardDescription>Aliases are normalized on the server and protected by the existing global-or-vendor uniqueness constraint.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitAlias}>
                  <Field label="Alias text" required><Textarea value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder="e.g. DOLO 650 TAB" /></Field>
                  <Field label="Alias scope"><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">Global alias</option>{vendorsQuery.data?.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.name}</option>)}</select></Field>
                  <Field label="Curation source"><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={aliasSource} onChange={(event) => setAliasSource(event.target.value as "MANUAL_CURATED" | "VENDOR_CURATED")}><option value="MANUAL_CURATED">Manual curation</option><option value="VENDOR_CURATED">Vendor curation</option></select></Field>
                  <Button type="submit" disabled={busy || !selectedItemId}><Tag className="mr-2 h-4 w-4" />Create alias</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}{required ? <span className="ml-1 text-rose-600">*</span> : null}</Label>{children}</div>;
}
