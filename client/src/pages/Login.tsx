import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";

export default function Login() {
  const handleOAuthLogin = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <img src="/manus-storage/deepthis-ortho-clinic-logo_47d1aff3.png" alt="Deepthis Ortho Clinic" className="h-32 mx-auto mb-4" />
          <p className="text-slate-600">Admin Access</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>
              Enter your clinic credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Password Login Button */}
            <Button
              type="button"
              className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium h-10"
              onClick={() => window.location.href = "/password-login"}
            >
              Sign in with Email & Password
            </Button>

            {/* Help Text */}
            <div className="pt-4 text-center text-sm text-slate-600">
              <p>Enter your clinic credentials to access the system</p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Clinic Management System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
