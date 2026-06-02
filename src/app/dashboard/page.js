import DashboardPage from "./DashboardPageImpl";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const bookingSaved =
    params?.success === "true" || params?.saved === "true";
  const initialDate = typeof params?.date === "string" ? params.date : "";
  const initialView = typeof params?.view === "string" ? params.view : "week";

  return (
    <DashboardPage
      bookingSaved={bookingSaved}
      initialDate={initialDate}
      initialView={initialView}
    />
  );
}
