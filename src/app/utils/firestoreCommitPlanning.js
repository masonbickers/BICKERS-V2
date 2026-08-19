export const buildFirestoreCommitWrites = (writes = [], documentRoot = "") =>
  writes.map(({ collection, documentId, patch, updateTime, exists }) => {
    const write = {
      update: {
        name: `${documentRoot}/${collection}/${documentId}`,
        fields: patch,
      },
      updateMask: { fieldPaths: Object.keys(patch) },
    };
    if (updateTime) write.currentDocument = { updateTime };
    else if (typeof exists === "boolean") write.currentDocument = { exists };
    return write;
  });
