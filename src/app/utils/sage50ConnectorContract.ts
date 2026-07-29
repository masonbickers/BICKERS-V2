export type SageIntegrationProduct = "sage_50_accounts_uk";

export type Sage50ConnectorStatus =
  | "offline"
  | "online"
  | "degraded"
  | "error"
  | "disabled";

export type Sage50ConnectorRecord = {
  provider: SageIntegrationProduct;
  mode: "windows_sdo_connector";
  connectorId: string;
  tenantId: string;
  companyId: string;
  displayName: string;
  status: Sage50ConnectorStatus;
  isEnabled: boolean;
  machineName: string | null;
  connectorVersion: string | null;
  sageVersion: string | null;
  sdoVersion: string | null;
  sageCompanyName: string | null;
  sageCompanyIdentifier: string | null;
  credentialVersion: number;
  credentialHash: string;
  credentialPrefix: string;
  lastHeartbeatAt: string | null;
  lastSuccessfulJobAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  registeredAt: string;
  registeredBy: { uid: string; email: string; role: string };
  disabledAt: string | null;
  disabledBy: { uid: string; email: string; role: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type Sage50ConnectorOperation = "create_sales_invoice";

export type Sage50CustomerLookupStatus =
  | "queued"
  | "claimed"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

export type Sage50CustomerLookupResult = {
  sageCustomerId: string;
  accountReference: string;
  name: string;
  addressSummary: string | null;
  postcode: string | null;
  email: string | null;
  phone: string | null;
  currency: string | null;
  isActive: boolean;
};

export type Sage50ExportJobStatus =
  | "queued"
  | "claimed"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type Sage50ExportLine = {
  lineNumber: number;
  sourceLineId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  nominalCode: string;
  taxCode: string;
  net: number;
  tax: number;
  gross: number;
};

export type Sage50ExportJob = {
  contractVersion: 1;
  product: SageIntegrationProduct;
  jobId: string;
  idempotencyKey: string;
  tenantId: string;
  operation: Sage50ConnectorOperation;
  requestedAt: string;
  requestedBy: string;
  invoice: {
    bookingId: string;
    jobNumber: string;
    draftReference: string;
    currency: string;
    purchaseOrderNumber: string | null;
    paymentTermsDays: number;
    customer: {
      sageCustomerId: string;
      legalName: string;
      billingCountry: string;
    };
    sourceQuoteNumber: string;
    lines: Sage50ExportLine[];
    totals: { net: number; tax: number; gross: number };
  };
};

export type Sage50ExportQueueRecord = Sage50ExportJob & {
  status: Sage50ExportJobStatus;
  invoiceId: string;
  connectorId: string;
  attemptCount: number;
  claimedAt: string | null;
  claimedBy: string | null;
  leaseTokenHash: string | null;
  leaseExpiresAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  result: Sage50ConnectorResult | null;
  createdAt: string;
  updatedAt: string;
};

export type Sage50ConnectorResult =
  | {
      contractVersion: 1;
      product: SageIntegrationProduct;
      jobId: string;
      outcome: "succeeded";
      completedAt: string;
      postedDate: string;
      sageInvoiceId: string;
      invoiceNumber: string;
      error: null;
    }
  | {
      contractVersion: 1;
      product: SageIntegrationProduct;
      jobId: string;
      outcome: "failed";
      completedAt: string;
      sageInvoiceId: null;
      invoiceNumber: null;
      error: { code: string | null; message: string; retryable: boolean };
    };
