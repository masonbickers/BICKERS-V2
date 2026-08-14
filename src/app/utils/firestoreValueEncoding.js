export const flattenFirestoreArrayValues = (values = []) =>
  (Array.isArray(values) ? values : []).flatMap((value) =>
    Array.isArray(value) ? flattenFirestoreArrayValues(value) : [value]
  );
