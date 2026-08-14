const clean = (value) => String(value || "").trim();

const uniqueValues = (values, normalise = (value) => value.toLowerCase()) => {
  const seen = new Set();
  return values.filter((value) => {
    const cleaned = clean(value);
    const key = normalise(cleaned);
    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(clean);
};

export const normaliseContactName = (value) =>
  clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

export const normaliseContactEmail = (value) => clean(value).toLowerCase();

export const canonicalContactEmail = (value) => {
  const email = normaliseContactEmail(value);
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${localPart.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return email;
};

export const normaliseContactPhone = (value) => {
  let digits = clean(value).replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return "";
  if (digits.startsWith("0044")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("44") && digits.length >= 12) digits = `0${digits.slice(2)}`;
  return digits;
};

const nameParts = (value) =>
  clean(value).toLowerCase().replace(/[^a-z0-9\s'-]/g, "").split(/\s+/).filter(Boolean);

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        above + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const pairEvidence = (left, right) => {
  const leftEmail = canonicalContactEmail(left.email);
  const rightEmail = canonicalContactEmail(right.email);
  const leftPhone = normaliseContactPhone(left.phone || left.number);
  const rightPhone = normaliseContactPhone(right.phone || right.number);
  const leftName = normaliseContactName(left.name);
  const rightName = normaliseContactName(right.name);
  const email = Boolean(leftEmail && leftEmail === rightEmail);
  const phone = Boolean(leftPhone && leftPhone === rightPhone);
  const exactName = Boolean(leftName && leftName === rightName);
  const leftParts = nameParts(left.name);
  const rightParts = nameParts(right.name);
  const sameSurname = Boolean(
    leftParts.length > 1 &&
    rightParts.length > 1 &&
    leftParts.at(-1) === rightParts.at(-1)
  );
  const leftFirst = leftParts[0] || "";
  const rightFirst = rightParts[0] || "";
  const similarFirstName = Boolean(
    leftFirst &&
    rightFirst &&
    (editDistance(leftFirst, rightFirst) <= 2 ||
      leftFirst.startsWith(rightFirst) ||
      rightFirst.startsWith(leftFirst))
  );

  return {
    email,
    phone,
    exactName,
    possible: exactName || (sameSurname && similarFirstName),
  };
};

const buildGroups = (contacts, matches) => {
  const parents = new Map(contacts.map((contact) => [contact.id, contact.id]));
  const find = (id) => {
    let root = id;
    while (parents.get(root) !== root) root = parents.get(root);
    while (parents.get(id) !== id) {
      const next = parents.get(id);
      parents.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  };

  matches.forEach(({ left, right }) => union(left.id, right.id));
  const grouped = new Map();
  contacts.forEach((contact) => {
    const root = find(contact.id);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(contact);
  });

  return [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const ids = new Set(group.map((contact) => contact.id));
      const groupMatches = matches.filter(({ left, right }) => ids.has(left.id) && ids.has(right.id));
      const reasons = [];
      if (groupMatches.some(({ evidence }) => evidence.email)) reasons.push("same email");
      if (groupMatches.some(({ evidence }) => evidence.phone)) reasons.push("same phone");
      if (groupMatches.some(({ evidence }) => evidence.exactName)) reasons.push("same name");
      return {
        id: group.map((contact) => contact.id).sort().join("--"),
        contacts: group,
        reasons,
      };
    });
};

export function analyseSavedContactDuplicates(contacts = []) {
  const validContacts = contacts.filter((contact) => contact?.id);
  const strongMatches = [];
  const possibleMatches = [];

  for (let leftIndex = 0; leftIndex < validContacts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < validContacts.length; rightIndex += 1) {
      const left = validContacts[leftIndex];
      const right = validContacts[rightIndex];
      const evidence = pairEvidence(left, right);
      const match = { left, right, evidence };
      if (evidence.email || evidence.phone) strongMatches.push(match);
      else if (evidence.possible) possibleMatches.push(match);
    }
  }

  const strongGroups = buildGroups(validContacts, strongMatches);
  const strongIds = new Set(strongGroups.flatMap((group) => group.contacts.map((contact) => contact.id)));
  const possibleGroups = buildGroups(
    validContacts.filter((contact) => !strongIds.has(contact.id)),
    possibleMatches.filter(({ left, right }) => !strongIds.has(left.id) && !strongIds.has(right.id))
  );

  return { strongGroups, possibleGroups };
}

export function createMergedContactPayload(contacts, primaryId) {
  const primary = contacts.find((contact) => contact.id === primaryId);
  if (!primary) throw new Error("Choose a primary contact before merging.");

  const emails = uniqueValues([
    primary.email,
    ...(primary.alternateEmails || []),
    ...contacts.filter((contact) => contact.id !== primaryId).flatMap((contact) => [
      contact.email,
      ...(contact.alternateEmails || []),
    ]),
  ], canonicalContactEmail);
  const phones = uniqueValues([
    primary.phone || primary.number,
    ...(primary.alternatePhones || []),
    ...contacts.filter((contact) => contact.id !== primaryId).flatMap((contact) => [
      contact.phone || contact.number,
      ...(contact.alternatePhones || []),
    ]),
  ], normaliseContactPhone);
  const names = uniqueValues([
    primary.name,
    ...(primary.aliases || []),
    ...contacts.filter((contact) => contact.id !== primaryId).flatMap((contact) => [
      contact.name,
      ...(contact.aliases || []),
    ]),
  ], normaliseContactName);
  const departments = uniqueValues(contacts.flatMap((contact) => [
    contact.department,
    ...(contact.alternateDepartments || []),
  ]));

  return {
    name: clean(primary.name) || names[0] || "",
    email: clean(primary.email) || emails[0] || "",
    phone: clean(primary.phone || primary.number) || phones[0] || "",
    number: clean(primary.phone || primary.number) || phones[0] || "",
    department: clean(primary.department) || departments[0] || "",
    aliases: names.filter((name) => normaliseContactName(name) !== normaliseContactName(primary.name)),
    alternateEmails: emails.filter((email) => canonicalContactEmail(email) !== canonicalContactEmail(primary.email)),
    alternatePhones: phones.filter((phone) => normaliseContactPhone(phone) !== normaliseContactPhone(primary.phone || primary.number)),
    alternateDepartments: departments.filter((department) => department.toLowerCase() !== clean(primary.department).toLowerCase()),
    mergedContactIds: uniqueValues([
      ...(primary.mergedContactIds || []),
      ...contacts.filter((contact) => contact.id !== primaryId).flatMap((contact) => [
        contact.id,
        ...(contact.mergedContactIds || []),
      ]),
    ]),
    alternateContactDetails: contacts
      .filter((contact) => contact.id !== primaryId)
      .map((contact) => ({
        id: contact.id,
        name: clean(contact.name),
        email: clean(contact.email),
        phone: clean(contact.phone || contact.number),
        department: clean(contact.department),
      })),
  };
}
