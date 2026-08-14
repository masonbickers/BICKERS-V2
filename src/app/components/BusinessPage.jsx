import {
  OperationsHeaderActions,
  OperationsPage,
  OperationsPageHeader,
  OperationsToolbar,
} from "@/app/components/OperationsPage";

export function BusinessPage(props) {
  return <OperationsPage data-page-section="business" {...props} />;
}

export function BusinessPageHeader(props) {
  return <OperationsPageHeader {...props} />;
}

export function BusinessHeaderActions(props) {
  return <OperationsHeaderActions {...props} />;
}

export function BusinessToolbar(props) {
  return <OperationsToolbar {...props} />;
}
