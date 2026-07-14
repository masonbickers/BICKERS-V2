"use client";

import { Calendar } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { localizer } from "@/app/utils/localizer";

const DraggableCalendar = withDragAndDrop(Calendar);

export function OperationalCalendar(props) {
  return <Calendar {...props} localizer={localizer} />;
}

export function DraggableOperationalCalendar(props) {
  return <DraggableCalendar {...props} localizer={localizer} />;
}
