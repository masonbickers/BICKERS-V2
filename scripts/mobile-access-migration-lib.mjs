const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const clean = (value) => String(value || "").trim();
export const cleanEmail = (value) => clean(value).toLowerCase();
export const safeUid = (value) => {
  const uid = clean(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : "";
};

export function employeeIsActive(employee = {}) {
  return !(
    employee.status === "disabled" ||
    employee.isEnabled === false ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.disabled === true ||
    employee.appDisabled === true ||
    employee.active === false
  );
}

export function userIsEnabled(user = {}) {
  return !(
    user.isEnabled === false ||
    user.active === false ||
    user.archived === true ||
    user.isArchived === true ||
    user.disabled === true ||
    user.appDisabled === true
  );
}

export function hasPasswordProvider(authUser = {}) {
  return Array.isArray(authUser?.providerData)
    && authUser.providerData.some((provider) => provider?.providerId === "password");
}

function employeeEmail(employee = {}) {
  return cleanEmail(employee.email || employee.workEmail || employee.emailAddress);
}

function employeeUidValues(employee = {}) {
  return [
    employee.authUid,
    employee.uid,
    employee.codeLoginUid,
    employee.userId,
    employee?.auth?.uid,
  ];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function authLastSignIn(authUser) {
  return clean(authUser?.metadata?.lastSignInTime);
}

function hasWorkspace(employee = {}) {
  return employee?.appAccess?.user === true || employee?.appAccess?.service === true;
}

export function buildMobileAccessMigrationReport({ employees, users, authUsers }) {
  const employeeRows = employees.map(({ id, data = {} }) => ({ id, data }));
  const userRows = users.map(({ id, data = {} }) => ({ id, data }));
  const authRows = authUsers.map((user) => ({ ...user, uid: safeUid(user.uid) }));
  const authByUid = new Map(authRows.filter((row) => row.uid).map((row) => [row.uid, row]));
  const authByEmail = new Map();
  for (const row of authRows) {
    const email = cleanEmail(row.email);
    if (!email) continue;
    const list = authByEmail.get(email) || [];
    list.push(row.uid);
    authByEmail.set(email, unique(list));
  }

  const raw = employeeRows.map(({ id, data }) => {
    const linkedUsers = userRows.filter(({ data: user }) => clean(user.employeeId) === id);
    const candidateUids = unique([
      ...employeeUidValues(data),
      ...linkedUsers.flatMap(({ id: userId, data: user }) => [userId, user.uid, user.authUid]),
    ].map(safeUid));
    return {
      employeeId: id,
      employee: data,
      email: employeeEmail(data),
      linkedUsers,
      candidateUids,
    };
  });

  const activeEmails = new Map();
  const uidOwners = new Map();
  for (const row of raw) {
    if (employeeIsActive(row.employee) && row.email) {
      const owners = activeEmails.get(row.email) || [];
      owners.push(row.employeeId);
      activeEmails.set(row.email, unique(owners));
    }
    for (const uid of row.candidateUids) {
      const owners = uidOwners.get(uid) || [];
      owners.push(row.employeeId);
      uidOwners.set(uid, unique(owners));
    }
  }

  const rows = raw.map((row) => {
    const { employeeId, employee, email, linkedUsers, candidateUids } = row;
    const issues = [];
    const signedInUids = candidateUids.filter((uid) => authLastSignIn(authByUid.get(uid)));
    const priorAppUser = signedInUids.length > 0;
    const active = employeeIsActive(employee);

    if ((activeEmails.get(email) || []).length > 1) issues.push("duplicate_employee_email");
    if (candidateUids.length > 1) issues.push("multiple_uid_candidates");
    if (candidateUids.some((uid) => (uidOwners.get(uid) || []).length > 1)) {
      issues.push("shared_uid");
    }
    if (linkedUsers.length > 1) issues.push("multiple_linked_user_documents");

    const uid = candidateUids.length === 1 ? candidateUids[0] : "";
    const linkedUser = linkedUsers.length === 1 ? linkedUsers[0] : null;
    const authUser = uid ? authByUid.get(uid) || null : null;

    if (linkedUser && uid && linkedUser.id !== uid) {
      issues.push("linked_user_document_id_mismatch");
    }
    if (linkedUser && uid) {
      const linkedUids = unique([linkedUser.id, linkedUser.data.uid, linkedUser.data.authUid].map(safeUid));
      if (linkedUids.some((value) => value !== uid)) {
        issues.push("linked_user_uid_mismatch");
      }
    }
    if (linkedUser && clean(linkedUser.data.companyId) !== clean(employee.companyId)) {
      issues.push("company_mismatch");
    }
    if (authUser?.email && cleanEmail(authUser.email) !== email) {
      issues.push("firebase_email_mismatch");
    }
    if (email && (authByEmail.get(email) || []).some((value) => value !== uid)) {
      issues.push("firebase_email_collision");
    }

    if (!active) {
      return {
        employeeId,
        name: clean(employee.name || employee.displayName),
        email,
        uid,
        linkedUserIds: linkedUsers.map(({ id }) => id),
        candidateUids,
        priorAppUser,
        classification: "disabled",
        targetStatus: "disabled",
        setupEmailRequired: false,
        passwordPreserved: hasPasswordProvider(authUser),
        issues: [...new Set(issues)],
        blocker: false,
      };
    }

    const identityIssues = new Set([
      "duplicate_employee_email",
      "multiple_uid_candidates",
      "shared_uid",
      "multiple_linked_user_documents",
      "linked_user_document_id_mismatch",
      "linked_user_uid_mismatch",
      "company_mismatch",
      "firebase_email_mismatch",
      "firebase_email_collision",
    ]);

    if (priorAppUser) {
      if (!EMAIL_RE.test(email)) issues.push("missing_or_invalid_email");
      if (!hasWorkspace(employee)) issues.push("missing_workspace_access");
      if (!uid || !authUser) issues.push("missing_firebase_auth_user");
      if (!linkedUser) issues.push("missing_linked_user_document");
      if (linkedUser && !userIsEnabled(linkedUser.data)) issues.push("linked_user_disabled");
      if (signedInUids.length !== 1 || signedInUids[0] !== uid) {
        issues.push("ambiguous_prior_sign_in");
      }
    }

    const blocker = issues.some((issue) => identityIssues.has(issue))
      || (priorAppUser && issues.length > 0);
    if (blocker) {
      return {
        employeeId,
        name: clean(employee.name || employee.displayName),
        email,
        uid,
        linkedUserIds: linkedUsers.map(({ id }) => id),
        candidateUids,
        priorAppUser,
        classification: "conflict",
        targetStatus: "pending",
        setupEmailRequired: false,
        passwordPreserved: hasPasswordProvider(authUser),
        issues: [...new Set(issues)],
        blocker: true,
      };
    }

    if (!priorAppUser) {
      return {
        employeeId,
        name: clean(employee.name || employee.displayName),
        email,
        uid,
        linkedUserIds: linkedUsers.map(({ id }) => id),
        candidateUids,
        priorAppUser: false,
        classification: "pending",
        targetStatus: "pending",
        setupEmailRequired: false,
        passwordPreserved: hasPasswordProvider(authUser),
        issues: ["no_prior_firebase_sign_in"],
        blocker: false,
      };
    }

    const passwordProvider = hasPasswordProvider(authUser);
    const setupEmailRequired = !passwordProvider || !cleanEmail(authUser?.email);
    return {
      employeeId,
      name: clean(employee.name || employee.displayName),
      email,
      uid,
      linkedUserIds: linkedUsers.map(({ id }) => id),
      candidateUids,
      priorAppUser: true,
      classification: setupEmailRequired ? "grandfather_invited" : "grandfather_active",
      targetStatus: setupEmailRequired ? "invited" : "active",
      setupEmailRequired,
      passwordPreserved: passwordProvider,
      issues: [],
      blocker: false,
    };
  });

  const summary = {
    employees: rows.length,
    grandfathered: rows.filter((row) => row.classification.startsWith("grandfather_")).length,
    setupEmails: rows.filter((row) => row.setupEmailRequired).length,
    pending: rows.filter((row) => row.classification === "pending").length,
    disabled: rows.filter((row) => row.classification === "disabled").length,
    conflicts: rows.filter((row) => row.blocker).length,
  };

  return { summary, rows };
}
