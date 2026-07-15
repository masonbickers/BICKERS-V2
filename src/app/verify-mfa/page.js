import { redirect } from "next/navigation";

export default function LegacyMfaVerificationPage() {
  redirect("/auth/complete");
}
