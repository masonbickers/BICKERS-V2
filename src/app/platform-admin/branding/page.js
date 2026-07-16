import { redirect } from "next/navigation";

export default function PlatformAdminBrandingPage() {
  redirect("/admin/global-styling?scope=platform");
}
