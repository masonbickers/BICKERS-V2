import { redirect } from "next/navigation";

export default function LegacyMfaSetupPage() {
  redirect("/auth/complete");
}
