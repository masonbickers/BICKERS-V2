import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, getDay, startOfWeek as dfStartOfWeek } from 'date-fns';
import enGB from 'date-fns/locale/en-GB';

const locales = {
  'en-GB': enGB,
};

// ✅ Force Monday as the start of the week (returns a real Date)
const startOfWeek = (date, locale) => {
  return dfStartOfWeek(date, { locale: enGB });
};

export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});
