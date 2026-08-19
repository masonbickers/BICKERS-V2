import {
  OperationsHeaderActions,
  OperationsPage,
  OperationsPageHeader,
  OperationsToolbar,
} from "@/app/components/OperationsPage";

export function PeopleFleetPage(props) {
  return <OperationsPage data-page-section="people-fleet" {...props} />;
}

export function PeopleFleetPageHeader(props) {
  return <OperationsPageHeader {...props} />;
}

export function PeopleFleetHeaderActions(props) {
  return <OperationsHeaderActions {...props} />;
}

export function PeopleFleetToolbar(props) {
  return <OperationsToolbar {...props} />;
}
