export type SageSyncStatus =
  | "not_ready"
  | "ready"
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

export type SageSyncError = {
  code: string | null;
  message: string | null;
};

export type SageSyncState = {
  status: SageSyncStatus;
  sageInvoiceId: string | null;
  sageCustomerId: string | null;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  error: SageSyncError | null;
};

export type SageReadinessBlocker = {
  code: string;
  message: string;
};

export type SageReadiness = {
  ready: boolean;
  blockers: SageReadinessBlocker[];
};

export type InvoiceAccountingLine = {
  nominalCode: string;
  taxCode: string;
};

export type SageCustomerMappingStatus = "unmapped" | "mapped" | "needs_review";

export type BillingAddress = {
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
};

export type CustomerFinanceProfile = {
  billingLegalName: string;
  billingTradingName: string;
  billingAddress: BillingAddress;
  billingCountry: string;
  accountsPayableContact: string;
  accountsPayableEmail: string;
  companyRegistrationNumber: string;
  vatNumber: string;
  defaultCurrency: string;
  defaultPaymentTerms: number;
  poRequirement: string;
  sageCustomerId: string | null;
  sageCustomerMappingStatus: SageCustomerMappingStatus;
  sageCustomerMappedAt: string | null;
  sageCustomerMappedBy: string | null;
};

export type InvoiceSageFields = {
  sageSync: SageSyncState;
};

export type IssuedInvoiceDocumentMetadata = {
  schemaVersion: 1;
  status: "stored";
  storagePath: string;
  filename: string;
  contentType: "application/pdf";
  byteLength: number;
  sha256: string;
  sourceSnapshotSha256: string;
  storageGeneration: string | null;
  generatedAt: string;
  generatedBy: {
    uid: string | null;
    email: string | null;
    role: string | null;
  };
};

export type InvoiceDeliveryStatus =
  | "not_sent"
  | "sending"
  | "sent"
  | "failed";

export type InvoiceDeliveryState = {
  status: InvoiceDeliveryStatus;
  recipient: string | null;
  subject: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  provider: "resend" | null;
  providerMessageId: string | null;
  sentBy: {
    uid: string | null;
    email: string | null;
    role: string | null;
  } | null;
  error: {
    code: string | null;
    message: string | null;
  } | null;
};

export type InvoiceLifecycleAction =
  | "save_draft"
  | "approve"
  | "return_to_draft"
  | "prepare_for_export"
  | "confirm_external_issue"
  | "void";
