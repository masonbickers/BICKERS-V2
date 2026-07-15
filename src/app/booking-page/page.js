"use client";

import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Card, Grid, Page, PageHeader } from "@/app/components/ui";


export default function CreateBookingPage() {
  const router = useRouter();

  const bookingOptions = [
    {
      title: "Create Booking",
      description: "Schedule a new booking including crew, vehicles and location.",
      link: "/create-booking"
    },
    {
      title: "Recce Booking",
      description: "Book a recce to inspect locations before a shoot using the main booking form.",
      link: "/create-booking"
    },
    {
      title: "Stunt Booking",
      description: "Schedule a stunt-specific booking using the main booking form.",
      link: "/create-booking"
    }
  ];

  return (
    <HeaderSidebarLayout>
      <Page>
        <PageHeader
          title="Booking options"
          subtitle="Choose the booking workflow that best matches the work being scheduled."
        />
        <Grid columns={3} gap={5}>
          {bookingOptions.map((item, idx) => (
            <Card key={idx} as="button" type="button" interactive onClick={() => router.push(item.link)}>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </Card>
          ))}
        </Grid>
      </Page>
    </HeaderSidebarLayout>
  );
}
