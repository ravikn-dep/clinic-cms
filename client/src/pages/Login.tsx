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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 mb-4">
            <span className="text-2xl font-bold text-white">🏥</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Clinic CMS</h1>
          <p className="text-slate-600">Admin Access</p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>
              Sign in with your Manus account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OAuth Login Button */}
            <Button
              onClick={handleOAuthLogin}
              className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium h-10"
            >
              Sign in with Manus OAuth
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">or</span>
              </div>
            </div>

            {/* Alternative Login Option */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = "/password-login"}
            >
              Sign in with Email & Password
            </Button>

            {/* Help Text */}
            <div className="pt-4 text-center text-sm text-slate-600">
              <p>For staff/consultant login, use the password login option</p>
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
