import DashboardPage from "./DashboardPageImpl";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const bookingSaved =
    params?.success === "true" || params?.saved === "true";

  return <DashboardPage bookingSaved={bookingSaved} />;
}
