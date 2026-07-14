"use client";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enGB from "date-fns/locale/en-GB";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-GB": enGB },
});

export default function LazyBigCalendar(props) {
  return <Calendar localizer={localizer} {...props} />;
}
