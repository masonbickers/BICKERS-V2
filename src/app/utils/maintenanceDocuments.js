const text = (value) => String(value || "").trim();

export const maintenanceDocumentUrl = (document = {}) =>
  text(
    typeof document === "string"
      ? document
      : document.url ||
          document.downloadURL ||
          document.downloadUrl ||
          document.fileUrl ||
          document.documentUrl
  );

export const maintenanceDocumentId = (document = {}) =>
  text(document?.id || document?.storagePath || maintenanceDocumentUrl(document));

export const normalizeMaintenanceUploader = (uploader = {}) => {
  if (typeof uploader === "string") {
    return { uid: "", name: uploader || "Unknown", email: "" };
  }
  return {
    uid: text(uploader.uid || uploader.userUid),
    name: text(uploader.name || uploader.displayName || uploader.email) || "Unknown",
    email: text(uploader.email),
  };
};

export const getCurrentMaintenanceUploader = (authState = {}, firebaseUser = null) =>
  normalizeMaintenanceUploader({
    uid: authState?.user?.uid || firebaseUser?.uid,
    name:
      authState?.userDoc?.displayName ||
      authState?.userDoc?.name ||
      authState?.user?.displayName ||
      firebaseUser?.displayName ||
      authState?.user?.email ||
      firebaseUser?.email,
    email: authState?.user?.email || firebaseUser?.email,
  });

export const normalizeMaintenanceDocument = (document, defaults = {}) => {
  const sourceDocument =
    typeof document === "string" ? { url: document } : document && typeof document === "object" ? document : {};
  const url = maintenanceDocumentUrl(sourceDocument);
  const storagePath = text(sourceDocument.storagePath || defaults.storagePath);
  const uploadedAt = text(
    sourceDocument.uploadedAt ||
      sourceDocument.createdAt ||
      sourceDocument.completedAt ||
      defaults.uploadedAt
  );
  const maintenanceTypeId = text(
    sourceDocument.maintenanceTypeId || defaults.maintenanceTypeId
  ).toLowerCase();
  const source = text(sourceDocument.source || defaults.source) || "maintenance";
  const id =
    text(sourceDocument.id) ||
    storagePath ||
    url ||
    `${maintenanceTypeId}:${uploadedAt}:${text(sourceDocument.name || defaults.name)}`;

  return {
    id,
    name:
      text(
        sourceDocument.name ||
          sourceDocument.fileName ||
          sourceDocument.filename ||
          defaults.name
      ) || "Maintenance document",
    url,
    storagePath,
    contentType: text(sourceDocument.contentType || defaults.contentType),
    size: Number(sourceDocument.size || defaults.size || 0),
    maintenanceTypeId,
    source,
    sourceRecordId: text(sourceDocument.sourceRecordId || defaults.sourceRecordId),
    uploadedAt,
    uploadedBy: normalizeMaintenanceUploader(
      sourceDocument.uploadedBy ||
        (sourceDocument.uploadedByUid ||
        sourceDocument.uploadedByName ||
        sourceDocument.uploadedByEmail ||
        sourceDocument.uploader
          ? {
              uid: sourceDocument.uploadedByUid,
              name: sourceDocument.uploadedByName || sourceDocument.uploader,
              email: sourceDocument.uploadedByEmail,
            }
          : defaults.uploadedBy)
    ),
  };
};

export const buildMaintenanceDocument = ({
  file,
  url,
  storagePath,
  maintenanceTypeId,
  source,
  sourceRecordId = "",
  uploadedAt = new Date().toISOString(),
  uploadedBy,
}) =>
  normalizeMaintenanceDocument(
    {
      id:
        globalThis.crypto?.randomUUID?.() ||
        `${maintenanceTypeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file?.name || "Maintenance document",
      url,
      storagePath,
      contentType: file?.type || "",
      size: Number(file?.size || 0),
      maintenanceTypeId,
      source,
      sourceRecordId,
      uploadedAt,
      uploadedBy,
    },
    { maintenanceTypeId, source, sourceRecordId, uploadedAt, uploadedBy }
  );

export const sameMaintenanceDocument = (left, right) => {
  const leftId = maintenanceDocumentId(left);
  const rightId = maintenanceDocumentId(right);
  return Boolean(leftId && rightId && leftId === rightId);
};

export const normalizeMaintenanceDocumentList = (documents, defaults = {}) =>
  (Array.isArray(documents) ? documents : [])
    .map((document) => normalizeMaintenanceDocument(document, defaults))
    .filter((document) => document.url);

export const removeMaintenanceDocument = (documents, target, defaults = {}) =>
  normalizeMaintenanceDocumentList(documents, defaults).filter(
    (document) => !sameMaintenanceDocument(document, target)
  );

export const removeMaintenanceDocumentFromHistory = (
  history,
  target,
  defaults = {}
) =>
  (Array.isArray(history) ? history : []).map((entry) => ({
    ...entry,
    maintenanceTypeId:
      text(entry?.maintenanceTypeId || defaults.maintenanceTypeId).toLowerCase(),
    documents: removeMaintenanceDocument(entry?.documents, target, {
      ...defaults,
      sourceRecordId:
        entry?.sourceRecordId || entry?.id || entry?.completedDate || defaults.sourceRecordId,
    }),
  }));

export const appendMaintenanceDocumentToHistory = (
  history,
  {
    maintenanceTypeId,
    completedDate,
    completedAt = new Date().toISOString(),
    label = "",
    document,
  }
) => {
  const rows = Array.isArray(history) ? [...history] : [];
  const normalizedDocument = normalizeMaintenanceDocument(document, {
    maintenanceTypeId,
    sourceRecordId: completedDate,
  });
  const index = rows.findIndex(
    (entry) =>
      text(entry?.maintenanceTypeId).toLowerCase() === text(maintenanceTypeId).toLowerCase() &&
      text(entry?.completedDate).slice(0, 10) === text(completedDate).slice(0, 10)
  );

  if (index >= 0) {
    rows[index] = {
      ...rows[index],
      maintenanceTypeId,
      documents: [
        ...normalizeMaintenanceDocumentList(rows[index]?.documents, {
          maintenanceTypeId,
          sourceRecordId: completedDate,
        }),
        normalizedDocument,
      ],
    };
    return rows;
  }

  return [
    ...rows,
    {
      maintenanceTypeId,
      label,
      completedDate,
      nextDueDate: "",
      completedAt,
      documents: [normalizedDocument],
    },
  ];
};
