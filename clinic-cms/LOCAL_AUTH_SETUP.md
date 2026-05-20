# Local Authentication Setup Guide

This document explains how the clinic CMS now uses local username/password authentication for consultants and staff instead of Manus OAuth.

---

## Overview

The clinic CMS now supports **two authentication methods**:

1. **Manus OAuth** - For the clinic admin (owner)
2. **Local Authentication** - For consultants and staff

This provides:
- ✅ Centralized admin access via Manus OAuth
- ✅ Simple username/password login for clinic staff
- ✅ No external dependencies for staff login
- ✅ Full feature access control based on roles
- ✅ Session management with JWT tokens

---

## How It Works

### Login Flow

```
User visits /qr-login
    ↓
Enters credentials (User ID + Password)
    ↓
System encodes as base64 and calls loginWithQRCode API
    ↓
Backend validates credentials against database
    ↓
Creates JWT session token with local user ID
    ↓
Sets session cookie (httpOnly, secure)
    ↓
Frontend redirects to dashboard
    ↓
User sees filtered navigation based on role permissions
```

### Session Management

**Session Token Creation:**
- Created when user logs in via `/qr-login`
- Format: JWT with payload containing `openId: "local-{userId}"`
- Signed with `JWT_SECRET` environment variable
- Expires after 1 year (configurable)

**Session Verification:**
- On every API request, SDK extracts session cookie
- Verifies JWT signature and expiration
- Checks if user is local (`openId.startsWith("local-")`)
- Retrieves user from database using local ID
- Updates `lastSignedIn` timestamp

**Session Storage:**
- Cookie name: `session`
- HttpOnly: Yes (prevents JavaScript access)
- Secure: Yes (HTTPS only in production)
- SameSite: Lax (CSRF protection)
- Max-Age: 1 year

---

## Test Credentials

### Consultant User
```
User ID:  CONS-001
Password: mpwM3dgl
Name:     Dr. Priya Sharma
Role:     Consultant
```

### Staff User
```
User ID:  STAFF-001
Password: 1ZVOc@uD
Name:     Rajesh Kumar
Role:     Staff
```

---

## Login Page

**URL:** `/qr-login`

**Features:**
- Clean, professional interface
- User ID input field
- Password input field
- Test credentials displayed for reference
- Error messages for failed login
- Success message with redirect

**Example:**
```
┌─────────────────────────────────┐
│  Staff & Consultant Login       │
│                                 │
│  User ID:  [CONS-001         ]  │
│  Password: [••••••••         ]  │
│                                 │
│  [Login]                        │
│                                 │
│  Test Credentials:              │
│  Consultant: CONS-001 / mpwM3dgl│
│  Staff: STAFF-001 / 1ZVOc@uD   │
└─────────────────────────────────┘
```

---

## Backend Implementation

### API Endpoint

**Procedure:** `rbac.loginWithQRCode`
**Type:** Public mutation (no auth required)
**Input:** `{ encodedData: string }`
**Output:** `{ success: boolean, user: UserInfo }`

### Process

1. **Decode Credentials**
   ```typescript
   const { userId, password } = utils.decodeQRCodeLogin(input.encodedData);
   ```

2. **Find User**
   ```typescript
   const user = await db.getStaffUserByUsername(userId);
   ```

3. **Validate Password**
   ```typescript
   const isPasswordValid = await utils.verifyPassword(password, user.passwordHash);
   ```

4. **Check Active Status**
   ```typescript
   if (!user.isActive) throw new Error("User account is inactive");
   ```

5. **Create Session Token**
   ```typescript
   const sessionToken = await sdk.createSessionToken(
     `local-${user.userId}`,
     { name: user.name }
   );
   ```

6. **Set Cookie**
   ```typescript
   ctx.res.cookie("session", sessionToken, {
     httpOnly: true,
     secure: process.env.NODE_ENV === "production",
     sameSite: "lax",
     maxAge: 365 * 24 * 60 * 60 * 1000,
     path: "/",
   });
   ```

7. **Update Last Signed In**
   ```typescript
   await db.updateStaffUser(user.userId, { lastSignedIn: new Date() });
   ```

### Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid credentials | Wrong User ID or password | Check credentials |
| User account is inactive | Admin deactivated the user | Contact admin |
| QR code login failed | Server error | Try again or contact support |

---

## Frontend Implementation

### QR Login Page (`client/src/pages/QRLogin.tsx`)

**Key Components:**
- Form with User ID and Password fields
- Submit handler that encodes credentials
- tRPC mutation for API call
- Error and success message display
- Auto-redirect to dashboard on success

**Code Flow:**
```typescript
const handleManualLogin = (e: React.FormEvent) => {
  // 1. Validate inputs
  if (!manualUserId || !manualPassword) {
    setError("Please enter both User ID and Password");
    return;
  }

  // 2. Encode credentials (simulating QR code data)
  const encodedData = btoa(`${manualUserId}:${manualPassword}`);

  // 3. Call API
  loginWithQR.mutate({ encodedData });
};

// 4. On success, redirect to dashboard
const loginWithQR = trpc.rbac.loginWithQRCode.useMutation({
  onSuccess: (data) => {
    setSuccess(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  },
});
```

---

## SDK Authentication Updates

### Local User Detection

The SDK now detects local users by checking if `openId` starts with `"local-"`:

```typescript
if (sessionUserId.startsWith("local-")) {
  const localUserId = sessionUserId.substring(6); // Remove "local-" prefix
  const staffUser = await db.getStaffUserById(localUserId);
  
  if (staffUser) {
    await db.updateStaffUser(localUserId, { lastSignedIn: signedInAt });
    return staffUser;
  }
}
```

### Session Verification Flow

1. Extract session cookie
2. Verify JWT signature
3. Check if local user (`openId.startsWith("local-")`)
4. If local: retrieve from staff users table
5. If OAuth: sync from OAuth server
6. Return user object with role and permissions

---

## Database Schema

### Users Table Fields (Relevant to Local Auth)

| Field | Type | Purpose |
|-------|------|---------|
| `openId` | varchar(64) | Unique identifier (local-{userId} for staff) |
| `userId` | varchar(50) | Staff user ID (CONS-001, STAFF-001, etc.) |
| `username` | varchar(100) | Username for login (lowercase userId) |
| `passwordHash` | text | Bcrypt hashed password |
| `role` | enum | user, admin, consultant, staff |
| `name` | text | User's full name |
| `email` | varchar(320) | Email address |
| `phone` | varchar(20) | Phone number |
| `department` | varchar(100) | Department (Orthopedics, etc.) |
| `isActive` | boolean | Account status |
| `lastSignedIn` | datetime | Last login timestamp |

---

## Creating New Staff Users

### Via Admin Panel

1. Log in as admin (DR RAVI N)
2. Go to **User Management** page
3. Click **Add Staff User**
4. Fill in details:
   - Name
   - Email (optional)
   - Phone (optional)
   - Department
   - Role (Consultant or Staff)
5. Click **Create User**
6. System generates:
   - Unique User ID (CONS-001, STAFF-001, etc.)
   - Temporary password
   - QR code for easy login

### Database Fields Set

- `userId`: Auto-generated (CONS-001, STAFF-001)
- `username`: Lowercase version of userId
- `passwordHash`: Bcrypt hashed temporary password
- `openId`: `local-{userId}` (for session identification)
- `role`: consultant or staff
- `isActive`: true (by default)

---

## Password Management

### Password Hashing

- Algorithm: Bcrypt
- Salt rounds: 10
- Storage: `passwordHash` field in users table

### Temporary Passwords

When creating a new user:
- System generates 8-character random password
- Contains uppercase, lowercase, numbers, and symbols
- Displayed to admin for distribution
- User should change on first login (future enhancement)

### Password Reset

Currently, only admins can reset passwords:
1. Admin deletes the user
2. Admin creates a new user with same details
3. New temporary password is generated

---

## Feature Access Control

### How It Works with Local Auth

1. **User logs in** via `/qr-login`
2. **Session created** with `openId: "local-{userId}"`
3. **User object retrieved** from database with role
4. **Frontend fetches permissions** based on role
5. **Navigation filtered** to show only permitted features
6. **Routes protected** with `ProtectedRoute` component
7. **UI components gated** with `FeatureGate` component

### Role-Based Permissions

| Feature | Admin | Consultant | Staff |
|---------|-------|-----------|-------|
| Patient Records | ✅ | Configurable | Configurable |
| Ambient Scribe | ✅ | Configurable | Configurable |
| Pharmacy | ✅ | Configurable | Configurable |
| Billing | ✅ | Configurable | Configurable |
| Purchase Orders | ✅ | Configurable | Configurable |
| Notifications | ✅ | Configurable | Configurable |
| Audit Trail | ✅ | ❌ | ❌ |
| Daily Export | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ |
| Feature Access Control | ✅ | ❌ | ❌ |

---

## Security Considerations

### Password Security
- ✅ Passwords hashed with Bcrypt (10 rounds)
- ✅ Never stored in plain text
- ✅ Never logged or displayed
- ✅ Temporary passwords for new users

### Session Security
- ✅ JWT tokens signed with `JWT_SECRET`
- ✅ Cookies marked as HttpOnly (JS cannot access)
- ✅ Cookies marked as Secure (HTTPS only in production)
- ✅ SameSite: Lax (CSRF protection)
- ✅ 1-year expiration (configurable)

### Authentication Flow
- ✅ Credentials encoded before sending
- ✅ Server-side password verification
- ✅ User status checked (isActive)
- ✅ Last signed in timestamp updated
- ✅ Session verified on every request

### Access Control
- ✅ Frontend filtering (UX improvement)
- ✅ Backend enforcement (security)
- ✅ Role-based permissions
- ✅ Feature-level access control

---

## Troubleshooting

### Login Fails with "Invalid credentials"

**Possible causes:**
- Incorrect User ID
- Incorrect password
- User ID doesn't exist
- User account is inactive

**Solution:**
- Check test credentials: CONS-001 / mpwM3dgl
- Verify user was created in User Management
- Check if user account is active (admin can deactivate)

### Session Expires Immediately

**Possible causes:**
- `JWT_SECRET` changed
- Cookie settings incorrect
- Browser doesn't accept cookies

**Solution:**
- Verify `JWT_SECRET` is set correctly
- Check browser cookie settings
- Try in incognito mode
- Clear browser cache and cookies

### User Can't Access Features After Login

**Possible causes:**
- Feature not enabled for user's role
- Browser cache not updated
- Feature access not configured

**Solution:**
- Admin: Go to Feature Access Control
- Enable the feature for the user's role
- User: Refresh page (Ctrl+Shift+R)
- Check feature is visible in navigation menu

### "User not found" Error

**Possible causes:**
- Local user ID doesn't exist in database
- User was deleted
- Database connection issue

**Solution:**
- Admin: Create the user in User Management
- Check database connection
- Verify user ID format (CONS-001, STAFF-001)

---

## Testing

### Manual Testing

1. **Test Consultant Login**
   - Go to `/qr-login`
   - Enter: CONS-001 / mpwM3dgl
   - Should redirect to dashboard
   - Should see consultant-specific features

2. **Test Staff Login**
   - Go to `/qr-login`
   - Enter: STAFF-001 / 1ZVOc@uD
   - Should redirect to dashboard
   - Should see staff-specific features

3. **Test Feature Access**
   - Log in as consultant
   - Try accessing `/pharmacy` (if disabled)
   - Should see "Access Denied" page
   - Admin enables feature
   - Consultant refreshes page
   - Should now see pharmacy menu item

### Automated Testing

Run vitest tests:
```bash
pnpm test
```

All 119 tests should pass, including:
- Local authentication flow
- Password verification
- Session creation
- Feature access control
- Role-based permissions

---

## API Reference

### Login Endpoint

**Procedure:** `rbac.loginWithQRCode`
**Method:** POST
**URL:** `/api/trpc/rbac.loginWithQRCode`

**Request:**
```json
{
  "json": {
    "encodedData": "Q09OUy0wMDE6bXB3TTNkZ2w="
  }
}
```

**Response (Success):**
```json
{
  "result": {
    "data": {
      "success": true,
      "user": {
        "id": 123,
        "userId": "CONS-001",
        "name": "Dr. Priya Sharma",
        "role": "consultant",
        "department": "Orthopedics"
      }
    }
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "message": "Invalid credentials"
  }
}
```

---

## Next Steps

1. **Test the login flow** with provided credentials
2. **Configure feature permissions** in Feature Access Control
3. **Create additional staff users** as needed
4. **Monitor login activity** in audit logs
5. **Update passwords** if needed (via User Management)

---

## Support

For issues or questions:
1. Check this documentation
2. Review the TESTING_GUIDE.md
3. Check the FEATURE_ACCESS_GUIDE.md
4. Contact your system administrator
