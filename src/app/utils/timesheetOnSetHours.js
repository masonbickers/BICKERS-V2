import { computeTimesheetDayBreakdown } from "./timesheetHours.js";

export function computePaidEarlyArrivalHours(entry) {
  return computeTimesheetDayBreakdown({ ...(entry || {}), mode: "onset" }).paidEarly / 60;
}

export function computeOnSetBreakdown(entry) {
  const result = computeTimesheetDayBreakdown({ ...(entry || {}), mode: "onset" });

  return {
    travelToHrs: result.outboundTravel / 60,
    paidEarlyArrivalHrs: result.paidEarly / 60,
    preCallHrs: result.precall / 60,
    onSetBlockHrs: (result.onSetStandard + result.onSetOvertime) / 60,
    onSetPaidHrs: result.onSetStandard / 60,
    onSetOvertimeHrs: result.onSetOvertime / 60,
    travelBackHrs: result.returnTravel / 60,
    travelInsideTenHrs: result.returnWithinStandard / 60,
    travelAfterTenHrs: result.returnAfterStandard / 60,
    totalHrs: result.total / 60,
  };
}

export function computeOnSetHours(entry) {
  return computeOnSetBreakdown(entry).totalHrs;
}
