export function getPasswordLoginErrorMessage(message?: string) {
  if (message === "Invalid email or password") {
    return "Sign-in was not completed. If this account normally uses Microsoft sign-in, choose Continue with Microsoft; otherwise verify the User ID or email and password.";
  }
  return message || "Login failed. Please try again.";
}
