"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

export default function LazyFullCalendar(props) {
  return <FullCalendar plugins={[dayGridPlugin, interactionPlugin]} {...props} />;
}
