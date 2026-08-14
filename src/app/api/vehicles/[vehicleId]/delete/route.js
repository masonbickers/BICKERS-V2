import {
  adminCreateDocument,
  adminDeleteDocument,
  adminListDocuments,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  adminCompanyId,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import {
  VEHICLE_BOOKING_COLLECTIONS,
  linkedVehicleBookingDocuments,
} from "@/app/utils/vehicleDeletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value) => String(value || "").trim();

export async function DELETE(request, { params }) {
  const access = await requireAdminFromRequest(request);
  if (access.error) return access.error;

  const { vehicleId: rawVehicleId } = await params;
  const vehicleId = text(rawVehicleId);
  if (!vehicleId) return jsonError("Vehicle ID is required.", 400);

  try {
    const vehicle = await adminReadDocument("vehicles", vehicleId);
    if (!vehicle) return jsonError("Vehicle not found.", 404);

    const companyId = adminCompanyId(access.userData);
    if (companyId && vehicle.companyId && text(vehicle.companyId) !== companyId) {
      return jsonError("Vehicle belongs to another company.", 403);
    }

    const loadedCollections = await Promise.all(
      VEHICLE_BOOKING_COLLECTIONS.map(async (definition) => ({
        ...definition,
        documents: await adminListDocuments(definition.collection),
      }))
    );

    const linkedByCollection = loadedCollections.map((definition) => ({
      collection: definition.collection,
      documents: linkedVehicleBookingDocuments({
        documents: definition.documents,
        vehicleId,
        vehicleFields: definition.vehicleFields,
        companyId,
      }),
    }));

    // Delete dependent records first. If any removal fails, the vehicle remains so
    // the operation can be retried without leaving inaccessible orphan bookings.
    for (const group of linkedByCollection) {
      await Promise.all(group.documents.map((document) => adminDeleteDocument(group.collection, document.id)));
    }

    await adminDeleteDocument("vehicles", vehicleId);

    const deletedBookings = Object.fromEntries(
      linkedByCollection.map((group) => [group.collection, group.documents.length])
    );
    await adminCreateDocument("adminAuditLogs", {
      action: "vehicle_deleted_with_bookings",
      vehicleId,
      vehicleName: text(vehicle.name || vehicle.registration || vehicle.reg),
      companyId: companyId || text(vehicle.companyId),
      deletedBookings,
      actorUid: access.verifiedUser.uid,
      actorEmail: access.verifiedUser.email || access.userData.email || "",
      createdAt: new Date().toISOString(),
    }).catch((error) => console.error("Could not write vehicle deletion audit log:", error));

    return Response.json({ ok: true, vehicleId, deletedBookings });
  } catch (error) {
    console.error("Vehicle cascade deletion failed:", error);
    return jsonError(error instanceof Error ? error.message : "Vehicle deletion failed.", 500);
  }
}
