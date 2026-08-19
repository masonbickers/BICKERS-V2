import { Page, PageHeader } from "@/app/components/ui";
import styles from "./OperationsPage.module.css";

const cx = (...values) => values.filter(Boolean).join(" ");

export function OperationsPage({ className = "", ...props }) {
  return (
    <Page
      width="fluid"
      data-page-section="operations"
      className={cx(styles.page, className)}
      {...props}
    />
  );
}

export function OperationsPageHeader({ className = "", ...props }) {
  return <PageHeader className={cx(styles.header, className)} {...props} />;
}

export function OperationsHeaderActions({ className = "", ...props }) {
  return <div className={cx(styles.headerActions, className)} {...props} />;
}

export function OperationsToolbar({ className = "", ...props }) {
  return <div className={cx(styles.toolbar, className)} {...props} />;
}
