# Test User Credentials

## Consultant User
- **User ID:** CONS-001
- **Username:** cons-001
- **Password:** mpwM3dgl
- **Name:** Dr. Priya Sharma
- **Email:** priya@clinic.com
- **Department:** Orthopedics
- **Role:** Consultant

## Staff User
- **User ID:** STAFF-001
- **Username:** staff-001
- **Password:** 1ZVOc@uD
- **Name:** Rajesh Kumar
- **Email:** rajesh@clinic.com
- **Department:** Administration
- **Role:** Staff

## Login Instructions

1. Navigate to the QR Login page at `/qr-login`
2. Or use the local login credentials:
   - Username: Use the username above
   - Password: Use the password above

## Feature Access Testing

After logging in, test the feature access enforcement:

1. **Navigation Filtering:** Observe which menu items are visible
2. **Route Protection:** Try accessing restricted routes
3. **UI Components:** Check if buttons are disabled for restricted features

## Configuring Feature Permissions

1. Log in as admin
2. Go to Feature Access Control page
3. Select the role (Consultant or Staff)
4. Toggle features on/off
5. Save changes

The changes will be reflected immediately for users of that role.
