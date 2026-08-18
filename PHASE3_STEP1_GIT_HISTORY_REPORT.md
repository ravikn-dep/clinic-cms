# Phase 3 Step 1 OCR Git History Export Report

**Repository:** `ravikn-dep/clinic-cms`  
**Canonical base:** `09ec0d9d0e6c1738f466562362f84603d134650d` (`step2-stable-verified`)  
**Validated target:** `83015a0731ba6484949fe79b81993066d8ffd976`  
**Export branch:** `export/phase3-step1-ocr`  
**Bundle:** `CLINIC_CMS_PHASE3_STEP1_OCR.bundle`

## Target Commit

| Field | Value |
|---|---|
| Target SHA | `83015a0731ba6484949fe79b81993066d8ffd976` |
| Target tree SHA | `c144878e884c7a2f73962a480725f9db34e48a54` |
| Direct parent | `c0976cba95b765c67083d382557831504002ceb3` |
| Target message | Checkpoint: Completed Phase 3 Step 1 Google Cloud Vision OCR Foundation and Current Extraction Audit |
| Export ref | `refs/heads/export/phase3-step1-ocr` |

The target commit contains the provider-neutral OCR contract, Google Cloud Vision implementation, authenticated OCR route, mocked OCR tests, dependency changes, and the Phase 3 report. Its direct parent is the implementation commit `c0976cba95b765c67083d382557831504002ceb3`.

## Canonical Base Ancestry

The canonical base was confirmed through the GitHub repository API. Its tree SHA is `0501c8169fa0073de48d2a8878839cb71b107a46`, and it is a merge commit with parents `9c507ad0a624b473b9b92514cf5040d720652859` and `7549cde73abed0563d9dec93ad84648ff4230ff4`.

The managed workspace does not contain the canonical merge commit object `09ec0d9d0e6c1738f466562362f84603d134650d`, so Git cannot run a direct local `merge-base --is-ancestor 09ec... 83015...` test. The validated target does contain the canonical base's first parent `9c507ad0a624b473b9b92514cf5040d720652859` as an ancestor; the local merge base is exactly `9c507ad0a624b473b9b92514cf5040d720652859`. Therefore, the target is a descendant of the canonical Step 2 validation line but does not include the later canonical merge commit object itself. This history divergence is preserved rather than rewritten.

## Exact Changed Files: Canonical Base Tree to Target Tree

The following list was computed by comparing the GitHub canonical base tree `0501c8169fa0073de48d2a8878839cb71b107a46` with the target tree `c144878e884c7a2f73962a480725f9db34e48a54` by repository-relative path and blob SHA.

| Status | Repository path | Purpose / scope |
|---|---|---|
| Added | `PHASE_3_STEP_1_OCR_FOUNDATION_REPORT.md` | Phase 3 Step 1 audit and implementation report |
| Modified | `package.json` | Adds `@google-cloud/vision` dependency |
| Modified | `pnpm-lock.yaml` | Locks the Google Cloud Vision dependency tree |
| Added | `server/auth.login.test.ts` | Managed-workspace login connection resilience regression coverage |
| Modified | `server/db.ts` | Managed MySQL pool / reconnection resilience used by runtime queries |
| Added | `server/ocr.test.ts` | Mocked OCR validation, provider, error, and OCR-only boundary tests |
| Added | `server/ocr/googleVisionProvider.ts` | Google Cloud Vision `DOCUMENT_TEXT_DETECTION` provider wrapper |
| Added | `server/ocr/provider.ts` | Provider selection, mock fallback, and input validation |
| Added | `server/ocr/types.ts` | Provider-neutral OCR input, page, result, and interface types |
| Modified | `server/routers.ts` | Authenticated `ocr.extractDocument` tRPC route; no PO/GR/inventory mutation |
| Modified | `todo.md` | Engineering task history and Phase 3 export tracking |

There are **11 changed files** in the complete canonical-base-to-target tree delta. The bundle includes the complete reachable Git history ending at the target, not only these paths.

## Validation on Exact Target

The commands were run against commit `83015a0731ba6484949fe79b81993066d8ffd976`:

| Command | Result |
|---|---|
| `pnpm check` | PASS; 0 TypeScript errors |
| `pnpm test --run` | PASS; **177/177 tests** across 22 test files |
| `pnpm build` | PASS; Vite client and server bundle completed successfully |

The test suite used the mock OCR provider and did not call a paid Google Cloud API.

## Bundle Verification

The bundle was created with the export branch as its advertised ref and was verified immediately afterward:

```text
git bundle create CLINIC_CMS_PHASE3_STEP1_OCR.bundle export/phase3-step1-ocr
git bundle verify CLINIC_CMS_PHASE3_STEP1_OCR.bundle
```

Verification result:

```text
The bundle contains this ref:
83015a0731ba6484949fe79b81993066d8ffd976 refs/heads/export/phase3-step1-ocr
The bundle records a complete history.
The bundle uses this hash algorithm: sha1
CLINIC_CMS_PHASE3_STEP1_OCR.bundle is okay
```

The bundle was not modified after verification.

## Import Note

To import the bundle into a canonical clone, run:

```bash
git bundle verify CLINIC_CMS_PHASE3_STEP1_OCR.bundle
git fetch CLINIC_CMS_PHASE3_STEP1_OCR.bundle refs/heads/export/phase3-step1-ocr:refs/heads/export/phase3-step1-ocr
git show export/phase3-step1-ocr
```

Any canonicalization or merge of the divergent history should be reviewed separately. This export task did not push, merge, deploy, access production, or rewrite history.

## Final Classification

`PHASE3_STEP1_BUNDLE_READY_FOR_IMPORT`
