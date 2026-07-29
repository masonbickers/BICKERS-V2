import { redirect } from "next/navigation";

export default function SetupMfaPage() {
  redirect("/auth/complete");
}
