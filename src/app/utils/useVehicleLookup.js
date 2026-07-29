"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/app/utils/firebaseClient";
import { loadBookingFormReferenceData } from "@/app/utils/bookingFormReferenceData";
import { dataAccessKey, resolveDataAccess } from "@/app/utils/firestoreAccess";

const EMPTY_LOOKUP = { byId: {}, byReg: {}, byName: {} };

export function useVehicleLookup(dataAccessState) {
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [vehicleLookup, setVehicleLookup] = useState(EMPTY_LOOKUP);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking || !gate.allowed) return undefined;
    let active = true;
    loadBookingFormReferenceData(db, { accessState: dataAccessState })
      .then((referenceData) => {
        if (active) setVehicleLookup(referenceData.vehicleLookup || EMPTY_LOOKUP);
      })
      .catch((error) => console.warn("Could not resolve vehicle names", error));
    return () => {
      active = false;
    };
  }, [accessKey, dataAccessState]);

  return vehicleLookup;
}
