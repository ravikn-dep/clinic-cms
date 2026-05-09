# Frontend Feature Access Enforcement Guide

## Overview

The clinic CMS implements comprehensive feature access enforcement at three levels:
1. **Navigation Filtering** - Menu items hidden based on permissions
2. **Route Protection** - Unauthorized access redirects to access denied page
3. **UI Components** - Buttons and features conditionally rendered or disabled

---

## How Navigation Filtering Works for Non-Admin Users

### Step 1: User Logs In
When a user logs in, their role is determined:
- `admin` - Full access to all features
- `consultant` - Access based on configured permissions
- `staff` - Access based on configured permissions

### Step 2: Permissions Are Fetched
For non-admin users, the system fetches their feature permissions:

```typescript
// In useFeatureAccess hook
const { data: fullPermissions } = trpc.featureAccess.getPermissions.useQuery(
  { role: user.role } // "consultant" or "staff"
);

// Returns an object like:
// {
//   patient_records: true,
//   ambient_scribe: true,
//   pharmacy: false,
//   billing: true,
//   purchase_orders: false,
//   notifications: true,
//   audit_trail: false,
//   daily_export: false,
//   user_management: false
// }
```

### Step 3: Menu Items Are Filtered
The DashboardLayout filters menu items based on permissions:

```typescript
const visibleMenuItems = menuItems.filter(item => {
  // Always show dashboard and register patient (no permission needed)
  if (item.path === "/" || item.path === "/register-patient") return true;
  
  // Admin-only items hidden from non-admins
  if (item.adminOnly && user?.role !== "admin") return false;
  
  // Feature-gated items shown only if user has access
  if ("feature" in item && item.feature) {
    return hasAccess(item.feature); // Checks the permissions object
  }
  
  return true;
});
```

### Example: Consultant with Limited Access

**Permissions configured in Feature Access Control:**
- ✅ Patient Records - Enabled
- ✅ Ambient Scribe - Enabled
- ❌ Pharmacy - Disabled
- ✅ Billing - Enabled
- ❌ Purchase Orders - Disabled
- ✅ Notifications - Enabled
- ❌ Audit Trail - Disabled (admin-only)
- ❌ Daily Export - Disabled (admin-only)

**Visible Menu Items for this Consultant:**
```
✓ Dashboard
✓ Register Patient
✓ Patient Records          ← feature: "patient_records" (enabled)
✓ Ambient Scribe          ← feature: "ambient_scribe" (enabled)
✗ Pharmacy                ← feature: "pharmacy" (disabled - HIDDEN)
✓ Billing                 ← feature: "billing" (enabled)
✗ Purchase Orders         ← feature: "purchase_orders" (disabled - HIDDEN)
✓ Notifications           ← feature: "notifications" (enabled)
✗ User Management         ← adminOnly: true (HIDDEN)
✗ Feature Access Control  ← adminOnly: true (HIDDEN)
✗ OP Form Customization   ← adminOnly: true (HIDDEN)
✗ Audit Trail             ← feature: "audit_trail" (HIDDEN)
✗ Daily Export            ← feature: "daily_export" (HIDDEN)
```

---

## Menu Item Configuration

Each menu item in `DashboardLayout.tsx` has the following structure:

```typescript
{
  icon: IconComponent,
  label: "Display Name",
  path: "/route-path",
  
  // Optional: Mark as admin-only
  adminOnly?: true,
  
  // Optional: Link to a feature permission
  feature?: "feature_key" as const
}
```

### Feature Mapping

| Feature Key | Menu Item | Route | Permission |
|---|---|---|---|
| `patient_records` | Patient Records | `/patients` | Consultant/Staff |
| `ambient_scribe` | Ambient Scribe | `/scribe` | Consultant/Staff |
| `pharmacy` | Pharmacy | `/pharmacy` | Consultant/Staff |
| `billing` | Billing | `/billing` | Consultant/Staff |
| `purchase_orders` | Purchase Orders | `/purchase-orders` | Consultant/Staff |
| `notifications` | Notifications | `/notifications` | Consultant/Staff |
| `audit_trail` | Audit Trail | `/audit-logs` | Admin + Feature |
| `daily_export` | Daily Export | `/daily-export` | Admin + Feature |
| N/A | User Management | `/users` | Admin Only |
| N/A | Feature Access Control | `/feature-access` | Admin Only |
| N/A | OP Form Customization | `/op-form-customization` | Admin Only |

---

## Route Protection

When a user tries to access a protected route directly (e.g., via URL), the `ProtectedRoute` component checks permissions:

```typescript
// In App.tsx
<Route path={"/patients"}>
  {() => <ProtectedRoute feature="patient_records">
    <PatientRecords />
  </ProtectedRoute>}
</Route>
```

### Access Denied Page

If a non-admin user tries to access a restricted route:

1. The `ProtectedRoute` component detects they lack permission
2. Shows an "Access Denied" card with:
   - Lock icon
   - Explanation of why access is denied
   - "Return to Dashboard" button
   - Suggestion to contact administrator

Example message:
```
🔒 Access Denied

You don't have access to Patient Records.

Your administrator can enable Patient Records access in the 
Feature Access Control settings.

[Return to Dashboard]
```

---

## UI Component Gating

For conditional rendering of UI elements, use the `FeatureGate` component:

```typescript
import { FeatureGate, FeatureGateButton } from "@/components/FeatureGate";

// Hide entire section if feature not accessible
<FeatureGate feature="billing">
  <BillingSection />
</FeatureGate>

// Show permission denied message instead
<FeatureGate feature="billing" fallback={<PermissionDenied feature="billing" />}>
  <BillingSection />
</FeatureGate>

// Disable button if feature not accessible
<FeatureGateButton feature="billing">
  Generate Invoice
</FeatureGateButton>
```

---

## Permission Check Hooks

Three hooks are available for permission checking:

### 1. `useFeatureAccess()` - Full Control
Returns complete access information:

```typescript
const { 
  hasAccess,           // (feature) => boolean
  canAccessRoute,      // (path) => boolean
  accessibleFeatures,  // string[]
  accessibleRoutes,    // string[]
  isLoading,          // boolean
  error               // Error | null
} = useFeatureAccess();

// Usage
if (hasAccess("billing")) {
  // Show billing section
}
```

### 2. `useCanAccessFeature(feature)` - Simple Check
Checks a single feature:

```typescript
const hasAccess = useCanAccessFeature("billing");

if (hasAccess) {
  return <BillingPage />;
}
```

### 3. `useCanAccessRoute(path)` - Route Check
Checks if a route is accessible:

```typescript
const canAccess = useCanAccessRoute("/billing");

if (!canAccess) {
  return <AccessDenied />;
}
```

---

## Admin vs Non-Admin Behavior

### Admin Users
- ✅ See all menu items
- ✅ Can access all routes
- ✅ Can use all UI features
- ✅ Can manage feature permissions in "Feature Access Control"

### Consultant/Staff Users
- 👁️ See only permitted features in menu
- 🚫 Get access denied page for restricted routes
- 🔒 See disabled/hidden UI elements for restricted features
- ❌ Cannot access admin-only pages

---

## Testing Navigation Filtering

To test the navigation filtering with different permission levels:

1. **Access Feature Access Control** (admin only)
   - Navigate to `/feature-access`
   - Select "Consultant" or "Staff" tab
   - Toggle features on/off
   - Click "Save Changes"

2. **Create a test consultant/staff account**
   - Use User Management page
   - Set role to "consultant" or "staff"

3. **Log in as the test user**
   - Observe which menu items are visible
   - Try accessing restricted routes
   - Verify access denied pages appear

4. **Modify permissions**
   - Return to Feature Access Control
   - Enable/disable features
   - Refresh page to see menu update

---

## Implementation Files

| File | Purpose |
|---|---|
| `client/src/lib/featureAccess.ts` | Feature constants and utilities |
| `client/src/hooks/useFeatureAccess.ts` | Permission checking hook |
| `client/src/components/DashboardLayout.tsx` | Navigation filtering logic |
| `client/src/components/ProtectedRoute.tsx` | Route protection component |
| `client/src/components/FeatureGate.tsx` | UI component gating |
| `client/src/App.tsx` | Route definitions with protection |
| `client/src/__tests__/featureAccess.test.ts` | Feature access tests |

---

## Flow Diagram

```
User Logs In
    ↓
Check Role (admin/consultant/staff)
    ↓
├─ Admin? → All features accessible
│
└─ Consultant/Staff?
    ↓
    Fetch permissions for role
    ↓
    DashboardLayout filters menu items
    ├─ Always show: Dashboard, Register Patient
    ├─ Hide: Admin-only items
    └─ Show/Hide: Feature-gated items based on permissions
    ↓
User sees filtered navigation menu
    ↓
User clicks menu item or navigates to route
    ↓
ProtectedRoute checks access
    ├─ Allowed? → Show page
    └─ Denied? → Show access denied page
```

---

## Summary

The navigation filtering system provides:
- **Transparent access control** - Users see only what they can access
- **Consistent enforcement** - Same rules apply across navigation, routes, and UI
- **Admin flexibility** - Admins can configure permissions per role
- **User-friendly feedback** - Clear messages when access is denied
