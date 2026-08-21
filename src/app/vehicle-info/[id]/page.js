import { redirect } from "next/navigation";

export default async function VehicleInfoAliasPage({ params }) {
  const { id } = await params;
  redirect(`/vehicle-edit/${encodeURIComponent(id)}`);
}
