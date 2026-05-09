# Login Guide for Consultants and Staff

This guide explains how consultants and staff members can log in to the clinic CMS system.

---

## Overview

There are **three ways** for non-admin users (consultants and staff) to log in:

1. **QR Code Login** (Recommended for clinic staff)
2. **Manual Credentials Login** (Backup method)
3. **Admin-generated QR Codes** (For easy distribution)

---

## Method 1: QR Code Login (Recommended)

### What is QR Login?

Each consultant and staff member receives a unique QR code that encodes their login credentials. They can scan this QR code using their device camera to log in instantly without typing.

### How to Access QR Login

1. Navigate to the **QR Login page** at: `/qr-login`
   - Full URL: `https://clinic-cms-47itftjn.manus.space/qr-login`
   - Or: `https://docm-clinic-cms.manus.space/qr-login`

2. You'll see a page with two options:
   - **Upload QR Code** - Upload a QR code image file
   - **Scan with Camera** - Use your device camera to scan the QR code
   - **Enter Credentials Manually** - Type your credentials (fallback)

### Steps to Log In with QR Code

#### Option A: Scan with Device Camera
1. Go to `/qr-login`
2. Click "Scan with Camera" button
3. Allow camera access when prompted
4. Point your device camera at the QR code
5. The system will automatically recognize and log you in

#### Option B: Upload QR Code Image
1. Go to `/qr-login`
2. Click "Upload QR Code" button
3. Select a QR code image file from your device
4. The system will decode and log you in

#### Option C: Manual Entry (Fallback)
1. Go to `/qr-login`
2. Click "Enter Credentials Manually"
3. Enter your credentials:
   - **User ID:** Your unique ID (e.g., `CONS-001`)
   - **Password:** Your temporary password
4. Click "Login"

---

## Method 2: Manual Credentials Login

If you don't have a QR code or prefer typing, you can log in manually.

### Access Manual Login

1. Go to `/qr-login`
2. Click "Enter Credentials Manually" button
3. Fill in your credentials:

```
User ID:  CONS-001 (or STAFF-001)
Password: Your temporary password
```

### Login Credentials

**Consultant User:**
```
User ID:  CONS-001
Password: mpwM3dgl
Name:     Dr. Priya Sharma
```

**Staff User:**
```
User ID:  STAFF-001
Password: 1ZVOc@uD
Name:     Rajesh Kumar
```

### Steps

1. Enter your **User ID** (e.g., `CONS-001`)
2. Enter your **Password**
3. Click **Login**
4. You'll be redirected to the dashboard

---

## Method 3: Admin-Generated QR Codes

### For Admins: Generating QR Codes

When creating new consultant or staff users, the system automatically generates a QR code containing their credentials.

**Steps:**
1. Log in as admin
2. Go to **User Management** page
3. Click **Add Staff User**
4. Fill in the user details:
   - Name
   - Email
   - Phone
   - Department
   - Role (Consultant or Staff)
5. Click **Create User**
6. The system will:
   - Generate a unique User ID (e.g., `CONS-001`)
   - Generate a temporary password
   - Create a QR code
   - Display the credentials on screen

### For Users: Using the QR Code

1. The admin will provide you with:
   - A QR code image (printed or digital)
   - Your User ID and temporary password (as backup)

2. Go to `/qr-login`
3. Scan the QR code or enter credentials manually
4. You'll be logged in and redirected to your dashboard

---

## After Login

### First Time Login

1. You'll be redirected to the **Dashboard**
2. Your role determines which features you can access:
   - **Consultants** - See features enabled for consultants
   - **Staff** - See features enabled for staff

3. The navigation menu will show only the features you have access to

### Dashboard Features

**Common for all roles:**
- Dashboard (home page)
- Register Patient (add new patients)

**Role-specific features** (based on Feature Access Control settings):
- Patient Records
- Ambient Scribe
- Pharmacy
- Billing
- Purchase Orders
- Notifications
- Audit Trail (admin-only)
- Daily Export (admin-only)

---

## Changing Your Password

Currently, the system uses temporary passwords. To change your password:

1. Contact your clinic administrator
2. They can reset your password through the User Management page
3. You'll receive a new temporary password
4. Log in with the new password

---

## Troubleshooting

### "Login Failed" Error

**Possible causes:**
- Incorrect User ID or Password
- User account not created yet
- Account has been deactivated

**Solution:**
- Double-check your credentials
- Contact your clinic administrator to verify your account

### QR Code Not Scanning

**Possible causes:**
- QR code image is blurry or damaged
- Camera permissions not granted
- QR code is too small or too large

**Solution:**
- Try uploading the QR code image instead
- Use manual credentials entry as fallback
- Ensure your device camera is working

### "Access Denied" After Login

**Possible causes:**
- Your role doesn't have access to that feature
- Feature is disabled for your role

**Solution:**
- Contact your clinic administrator
- They can enable the feature in Feature Access Control settings

### Session Expired

**Possible causes:**
- You've been inactive for too long
- Your session cookie expired

**Solution:**
- Go to `/qr-login` again
- Re-enter your credentials or scan your QR code
- You'll be logged back in

---

## Security Tips

1. **Keep your credentials private**
   - Don't share your User ID or password with anyone
   - Don't leave your QR code visible in public areas

2. **Log out when done**
   - Click your profile menu (top-right)
   - Click "Logout"
   - This ensures your session is closed

3. **Use a strong password**
   - If you change your password, use a mix of uppercase, lowercase, numbers, and symbols
   - Don't use easily guessable passwords

4. **Report suspicious activity**
   - If you notice unauthorized access
   - Contact your clinic administrator immediately

---

## Feature Access Control

### What is Feature Access Control?

Feature Access Control is an admin-only feature that determines which features each role can access.

### How It Works

1. **Admin configures permissions** for each role (Consultant/Staff)
2. **Features are toggled on/off** per role
3. **Users see only permitted features** in their navigation menu
4. **Restricted features show "Access Denied"** if accessed directly

### Example Configuration

| Feature | Consultant | Staff |
|---------|-----------|-------|
| Patient Records | ✅ Enabled | ❌ Disabled |
| Ambient Scribe | ✅ Enabled | ✅ Enabled |
| Pharmacy | ❌ Disabled | ✅ Enabled |
| Billing | ✅ Enabled | ❌ Disabled |
| Notifications | ✅ Enabled | ✅ Enabled |

### What You See

**Consultant View:**
- ✅ Patient Records (visible in menu)
- ✅ Ambient Scribe (visible in menu)
- ❌ Pharmacy (hidden from menu)
- ✅ Billing (visible in menu)
- ✅ Notifications (visible in menu)

**Staff View:**
- ❌ Patient Records (hidden from menu)
- ✅ Ambient Scribe (visible in menu)
- ✅ Pharmacy (visible in menu)
- ❌ Billing (hidden from menu)
- ✅ Notifications (visible in menu)

---

## Frequently Asked Questions

### Q: Can I log in from multiple devices?
**A:** Yes, you can log in from different devices simultaneously. Each login creates a separate session.

### Q: What if I forget my password?
**A:** Contact your clinic administrator. They can reset your password through the User Management page.

### Q: Can I change my User ID?
**A:** No, your User ID is permanent and assigned by your administrator. Contact them if you need help.

### Q: How long does my session last?
**A:** Your session remains active as long as you're using the system. If inactive for an extended period, you may need to log in again.

### Q: Can I access the system from outside the clinic?
**A:** Yes, the system is accessible from anywhere with an internet connection. Use the provided domain URL.

### Q: What if I lose my QR code?
**A:** Contact your clinic administrator. They can generate a new QR code or provide your credentials for manual login.

---

## Support

If you encounter any issues logging in:

1. **Check this guide** - Most common issues are covered above
2. **Contact your clinic administrator** - They can help reset your account or credentials
3. **Check the clinic's IT support** - For technical issues with your device or internet connection

---

## Summary

| Method | Access | Ease | Security |
|--------|--------|------|----------|
| QR Code Scan | `/qr-login` | Easiest | High |
| QR Code Upload | `/qr-login` | Easy | High |
| Manual Entry | `/qr-login` | Medium | Medium |

**Recommended:** Use QR Code scanning for fastest and most secure login.
