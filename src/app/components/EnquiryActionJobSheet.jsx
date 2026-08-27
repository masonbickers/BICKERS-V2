"use client";

import { useEffect } from "react";
import styles from "./EnquiryActionJobSheet.module.css";
import { buildEnquiryActionJobSheetData } from "@/app/utils/enquiryActionJobSheet";

const PRODUCTION_TYPES = ["Feature Film", "Commercial", "TV Netflix / Amazon", "TV Drama", "Promo", "Other"];
const WRITING_LINES = Array.from({ length: 9 }, (_, index) => index);

const Value = ({ children }) => <span className={styles.value}>{children || "\u00a0"}</span>;

export default function EnquiryActionJobSheet({ enquiry, printedAt }) {
  const data = buildEnquiryActionJobSheetData(enquiry, printedAt);

  useEffect(() => {
    document.body.classList.add("printing-enquiry-action-sheet");
    const originalTitle = document.title;
    const printTitle = `Bickers Action-Job Sheet${data.jobNumber ? ` ${data.jobNumber}` : ""}`;
    const preparePrint = () => { document.title = printTitle; };
    const restoreTitle = () => { document.title = originalTitle; };
    window.addEventListener("beforeprint", preparePrint);
    window.addEventListener("afterprint", restoreTitle);
    return () => {
      document.body.classList.remove("printing-enquiry-action-sheet");
      window.removeEventListener("beforeprint", preparePrint);
      window.removeEventListener("afterprint", restoreTitle);
      restoreTitle();
    };
  }, [data.jobNumber]);

  return (
    <section className={`${styles.printRoot} enquiry-action-sheet-print-root`} aria-label="Printable Bickers Action Job Sheet">
      <article className={styles.sheet}>
        <h1>Bickers Action-Job Sheet No {data.jobNumber || "________"}</h1>

        <div className={styles.topGrid}>
          <div className={styles.productionTypes}>
            <strong>Type of Production</strong>
            {PRODUCTION_TYPES.map((type) => (
              <span className={styles.productionType} key={type}>{type}</span>
            ))}
          </div>
          <div className={styles.topCell}><strong>Quote No/s</strong><Value>{data.quoteNumbers}</Value></div>
          <div className={styles.topCell}><strong>PO Number/s</strong><Value>{data.poNumbers}</Value></div>
          <div className={styles.topCell}><strong>Invoice No/s</strong><Value>{data.invoiceNumbers}</Value></div>
          <div className={styles.hsCell}>
            <strong>H &amp; S</strong>
            <span>C/I</span>
            <span>HOTEL</span>
          </div>
        </div>

        <div className={styles.productionGrid}>
          <div><strong>Production Company</strong><Value>{data.client}</Value></div>
          <div><strong>Production Name</strong><Value>{data.production}</Value></div>
        </div>

        <div className={styles.contacts}>
          {data.contacts.map((contact, index) => (
            <div className={styles.contactBlock} key={`${contact.email || contact.name || "blank"}-${index}`}>
              {data.contacts.length > 1 && <div className={styles.contactNumber}>Contact {index + 1}</div>}
              <div className={`${styles.contactRow} ${styles.contactRowShort}`}><strong>Contact :</strong><Value>{contact.name}</Value></div>
              <div className={`${styles.contactRow} ${styles.contactRowShort}`}><strong>Dept :</strong><Value>{contact.department}</Value></div>
              <div className={`${styles.contactRow} ${styles.contactRowShort}`}><strong>Tel:</strong><Value>{contact.phone}</Value></div>
              <div className={`${styles.contactRow} ${styles.contactRowMobile}`}><strong>Mobile:</strong><Value>{contact.mobile}</Value></div>
              <div className={`${styles.contactRow} ${styles.contactRowEmail}`}><strong>Email:</strong><Value>{contact.email}</Value></div>
            </div>
          ))}
        </div>

        <section className={styles.descriptionSection}>
          <h2>Job Description, Date and Location:</h2>
          <div className={styles.linedContent}>
            <div className={styles.detailsContent}>
              <div className={styles.jobMeta}>
                <p><strong>Shoot:</strong> {data.shootType || "To be confirmed"}</p>
                <p><strong>Dates:</strong> {data.dates || "To be confirmed"}</p>
                <p><strong>Location:</strong> {data.location || "To be confirmed"}</p>
              </div>
              {data.vehicles.length > 0 && <p><strong>Vehicles:</strong> {data.vehicles.join(", ")}</p>}
              {data.equipment.length > 0 && <p><strong>Equipment:</strong> {data.equipment.join(", ")}</p>}
              {data.notes && <p className={styles.notes}><strong>Job description:</strong> {data.notes}</p>}
            </div>
            <div className={styles.writingLines} aria-hidden="true">
              {WRITING_LINES.map((line) => <span key={line} />)}
            </div>
          </div>
        </section>

        <footer>
          <strong>
            DATE PRINTED: {data.printedDate || "________"} / ENQUIRY DATE: {data.enquiryDate || "________"}
          </strong>
        </footer>
      </article>
    </section>
  );
}
