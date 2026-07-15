"use client";

import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Card, Grid, Page, PageHeader } from "@/app/components/ui";

const SECTIONS = [
  { title: "Minor Service", description: "Record, review and submit minor vehicle service reports.", link: "/service/minor-service" },
  { title: "MOT Pre-Check", description: "Perform pre-MOT inspections and upload supporting files.", link: "/service/mot-precheck" },
  { title: "Service Forms", description: "General service forms, inspections and maintenance documents.", link: "/service/service-form" },
  { title: "Service History", description: "View full historical service logs for each vehicle.", link: "/service/service-history" },
  { title: "Service Records", description: "Access individual service entries and maintenance logs.", link: "/service/service-record" },
  { title: "Vehicle Prep", description: "Pre-shoot prep lists and pre-deployment checks.", link: "/service/vehicle-prep" },
  { title: "Daily Checks", description: "Daily driver and vehicle check submissions.", link: "/service/daily-check" },
  { title: "Defects", description: "Review, track and resolve reported vehicle defects.", link: "/service/defects" },
  { title: "Work / Repairs", description: "Book work, repairs and maintenance jobs.", link: "/service/work" },
];

export default function ServiceHomePage() {
  const router = useRouter();

  return (
    <HeaderSidebarLayout>
      <Page width="fluid">
        <PageHeader title="Service Management" subtitle="Service • MOT • Checks • Repairs • History" />
        <Grid columns={3} gap={4}>
          {SECTIONS.map((section) => (
            <Card key={section.link} as="button" type="button" interactive onClick={() => router.push(section.link)}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </Card>
          ))}
        </Grid>
      </Page>
    </HeaderSidebarLayout>
  );
}
