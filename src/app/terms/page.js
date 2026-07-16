"use client";

import layoutStyles from "./page.styles.module.css";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function TermsPage() {
  return (
    <HeaderSidebarLayout>
      <div
        className={layoutStyles.extracted1}
      >
        <h1 className={layoutStyles.extracted2}>
          Terms & Policies
        </h1>

        <section className={layoutStyles.extracted3}>
          <h2 className={layoutStyles.extracted4}>
            1. Overview
          </h2>
          <p className={layoutStyles.extracted5}>
            Bickers Booking System is designed for managing bookings, vehicles, staff, and production logistics. Use of this system implies acceptance of these terms.
          </p>
        </section>

        <section className={layoutStyles.extracted6}>
          <h2 className={layoutStyles.extracted7}>
            2. Data Usage
          </h2>
          <p className={layoutStyles.extracted8}>
            We store booking, staff, and vehicle data, including uploaded documents. This data is only used within the platform and not shared externally.
          </p>
        </section>

        <section className={layoutStyles.extracted9}>
          <h2 className={layoutStyles.extracted10}>
            3. User Responsibility
          </h2>
          <p className={layoutStyles.extracted11}>
            Users must ensure all data entered is accurate and up to date. Misuse of the system may result in restricted access.
          </p>
        </section>

        <section className={layoutStyles.extracted12}>
          <h2 className={layoutStyles.extracted13}>
            4. Access and Permissions
          </h2>
          <p className={layoutStyles.extracted14}>
            Permissions are assigned by role. Admins can modify all fields. Staff should only use permitted features. Contact support for access queries.
          </p>
        </section>

        <section className={layoutStyles.extracted15}>
          <h2 className={layoutStyles.extracted16}>
            5. File Uploads
          </h2>
          <p className={layoutStyles.extracted17}>
            Uploads must relate directly to the booking or job. Irrelevant or inappropriate uploads may be removed and reviewed.
          </p>
        </section>

        <section className={layoutStyles.extracted18}>
          <h2 className={layoutStyles.extracted19}>
            6. Terms Updates
          </h2>
          <p className={layoutStyles.extracted20}>
            Terms are subject to change. You will be notified of any updates. Continued use implies agreement to the latest terms.
          </p>
        </section>

        <p className={layoutStyles.extracted21}>
          Last updated: July 2025
        </p>
      </div>
    </HeaderSidebarLayout>
  );
}
