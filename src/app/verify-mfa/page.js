import { redirect } from "next/navigation";

export default function VerifyMfaPage() {
  redirect("/auth/complete");
}
