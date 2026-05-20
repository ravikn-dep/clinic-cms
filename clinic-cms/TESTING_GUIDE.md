# Feature Access Enforcement Testing Guide

This guide walks you through testing the frontend feature access enforcement system with the generated test user credentials.

---

## Test User Credentials

### Consultant User
```
User ID:    CONS-001
Username:   cons-001
Password:   mpwM3dgl
Name:       Dr. Priya Sharma
Email:      priya@clinic.com
Department: Orthopedics
Role:       Consultant
```

### Staff User
```
User ID:    STAFF-001
Username:   staff-001
Password:   1ZVOc@uD
Name:       Rajesh Kumar
Email:      rajesh@clinic.com
Department: Administration
Role:       Staff
```

---

## Testing Scenarios

### Scenario 1: Navigation Filtering for Consultant

**Steps:**
1. Log in as consultant (cons-001 / mpwM3dgl)
2. Observe the sidebar navigation menu

**Expected Results:**
- ✅ **Visible items:**
  - Dashboard
  - Register Patient
  - Patient Records (if enabled for consultants)
  - Ambient Scribe (if enabled for consultants)
  - Billing (if enabled for consultants)
  - Notifications (if enabled for consultants)

- ❌ **Hidden items:**
  - Pharmacy (if disabled for consultants)
  - Purchase Orders (if disabled for consultants)
  - Audit Trail (admin-only)
  - Daily Export (admin-only)
  - User Management (admin-only)
  - Feature Access Control (admin-only)
  - OP Form Customization (admin-only)

**Verification:**
- Count visible menu items
- Compare with Feature Access Control settings
- Verify admin-only items are never visible

---

### Scenario 2: Route Protection

**Steps:**
1. Log in as consultant (cons-001 / mpwM3dgl)
2. Try to access a restricted route directly:
   - Navigate to `/pharmacy` (if disabled for consultants)
   - Navigate to `/purchase-orders` (if disabled for consultants)
   - Navigate to `/audit-logs` (admin-only)

**Expected Results:**
- Access Denied page appears with:
  - 🔒 Lock icon
  - Message: "You don't have access to [Feature Name]"
  - "Return to Dashboard" button
  - Suggestion to contact administrator

**Verification:**
- Click "Return to Dashboard" button
- Verify redirect to home page
- Try accessing another restricted route

---

### Scenario 3: UI Component Gating

**Steps:**
1. Log in as consultant (cons-001 / mpwM3dgl)
2. Navigate to a page with feature-gated components
3. Look for buttons/sections with restricted features

**Expected Results:**
- Disabled buttons for restricted features
- Hidden sections for restricted features
- Tooltip/message explaining why feature is unavailable

**Example:**
- If "Pharmacy" is disabled, the "Manage Inventory" button should be disabled
- If "Billing" is disabled, the "Generate Invoice" button should be disabled

---

### Scenario 4: Permission Changes in Real-Time

**Steps:**
1. Log in as admin (DR RAVI N)
2. Go to Feature Access Control page
3. Select "Consultant" tab
4. Disable a feature (e.g., "Pharmacy")
5. Save changes
6. In another browser tab, log in as consultant
7. Refresh the page

**Expected Results:**
- Menu item for disabled feature disappears
- If consultant was on that page, they see Access Denied
- UI components for that feature are disabled/hidden

**Verification:**
- Re-enable the feature
- Verify menu item reappears
- Verify UI components are enabled again

---

### Scenario 5: Staff vs Consultant Permissions

**Steps:**
1. Log in as admin
2. Go to Feature Access Control page
3. Configure different permissions for Consultant and Staff
   - Example: Enable "Patient Records" for Consultant, disable for Staff
4. Log in as consultant in one tab
5. Log in as staff in another tab
6. Compare visible menu items

**Expected Results:**
- Consultant sees Patient Records menu item
- Staff does NOT see Patient Records menu item
- Both see common items (Dashboard, Register Patient)

---

### Scenario 6: Admin Full Access

**Steps:**
1. Log in as admin (DR RAVI N)
2. Observe the sidebar navigation menu

**Expected Results:**
- ✅ ALL menu items visible
- ✅ Can access all routes
- ✅ Can use all UI features
- ✅ Can access Feature Access Control page

---

## Configuring Feature Permissions

### For Consultants

1. Log in as admin
2. Navigate to **Feature Access Control** → **Consultant** tab
3. Toggle features:
   - Patient Records
   - Ambient Scribe
   - Pharmacy
   - Billing
   - Purchase Orders
   - Notifications
   - Audit Trail
   - Daily Export
4. Click **Save Changes**

### For Staff

1. Log in as admin
2. Navigate to **Feature Access Control** → **Staff** tab
3. Toggle features (same as above)
4. Click **Save Changes**

---

## Debugging Tips

### If menu items don't disappear after permission change:
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check browser console for errors
4. Verify the permission was saved in Feature Access Control

### If Access Denied page doesn't appear:
1. Check the route is protected in `App.tsx`
2. Verify the feature is mapped in `featureAccess.ts`
3. Check browser console for errors
4. Verify the user's permissions in the database

### If UI components don't disable:
1. Verify the component uses `FeatureGate` or `FeatureGateButton`
2. Check the feature key matches the permission key
3. Verify the permission is configured correctly
4. Check browser console for errors

---

## Test Checklist

- [ ] Consultant can see only permitted features in menu
- [ ] Staff can see only permitted features in menu
- [ ] Admin can see all features in menu
- [ ] Consultant gets Access Denied for restricted routes
- [ ] Staff gets Access Denied for restricted routes
- [ ] Admin can access all routes
- [ ] Buttons are disabled for restricted features
- [ ] Permission changes reflect immediately after refresh
- [ ] Different roles have different permissions
- [ ] "Return to Dashboard" button works on Access Denied page

---

## Performance Notes

- Navigation filtering happens on the client side (instant)
- Route protection happens on the client side (instant)
- Permission changes require a page refresh to take effect
- No database queries needed for permission checks (cached in memory)

---

## Security Notes

- Permissions are enforced on both frontend and backend
- Frontend enforcement improves UX (hides unavailable features)
- Backend enforcement ensures security (prevents direct API calls)
- Passwords are hashed with bcrypt (10 rounds)
- Session tokens are JWT-based with expiration

---

## Next Steps

1. Test all scenarios above
2. Report any issues or unexpected behavior
3. Adjust feature permissions as needed
4. Create additional test users if required
5. Document any custom permission configurations

For more details, see:
- `FEATURE_ACCESS_GUIDE.md` - Architecture and implementation details
- `server/routers.ts` - Backend permission logic
- `client/src/lib/featureAccess.ts` - Frontend permission constants
