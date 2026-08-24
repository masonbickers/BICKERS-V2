using System.Text.Json.Serialization;

namespace BickersAction.Sage50Connector.Transport;

public sealed record InvoiceExportClaimResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("queueJobId")] string? QueueJobId,
    [property: JsonPropertyName("job")] InvoiceExportJob? Job,
    [property: JsonPropertyName("leaseToken")] string? LeaseToken,
    [property: JsonPropertyName("leaseExpiresAt")] string? LeaseExpiresAt);

public sealed record InvoiceExportJob(
    [property: JsonPropertyName("contractVersion")] int ContractVersion,
    [property: JsonPropertyName("product")] string Product,
    [property: JsonPropertyName("jobId")] string JobId,
    [property: JsonPropertyName("idempotencyKey")] string IdempotencyKey,
    [property: JsonPropertyName("tenantId")] string TenantId,
    [property: JsonPropertyName("operation")] string Operation,
    [property: JsonPropertyName("requestedAt")] string RequestedAt,
    [property: JsonPropertyName("requestedBy")] string RequestedBy,
    [property: JsonPropertyName("invoice")] InvoiceExportPayload Invoice,
    [property: JsonPropertyName("attemptCount")] int AttemptCount);

public sealed record InvoiceExportPayload(
    [property: JsonPropertyName("bookingId")] string BookingId,
    [property: JsonPropertyName("jobNumber")] string JobNumber,
    [property: JsonPropertyName("draftReference")] string DraftReference,
    [property: JsonPropertyName("invoiceDate")] string InvoiceDate,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("purchaseOrderNumber")] string? PurchaseOrderNumber,
    [property: JsonPropertyName("paymentTermsDays")] int PaymentTermsDays,
    [property: JsonPropertyName("customer")] InvoiceExportCustomer Customer,
    [property: JsonPropertyName("sourceQuoteNumber")] string SourceQuoteNumber,
    [property: JsonPropertyName("lines")] IReadOnlyList<InvoiceExportLine> Lines,
    [property: JsonPropertyName("totals")] InvoiceExportTotals Totals);

public sealed record InvoiceExportCustomer(
    [property: JsonPropertyName("sageCustomerId")] string SageCustomerId,
    [property: JsonPropertyName("legalName")] string LegalName,
    [property: JsonPropertyName("billingCountry")] string BillingCountry);

public sealed record InvoiceExportLine(
    [property: JsonPropertyName("lineNumber")] int LineNumber,
    [property: JsonPropertyName("sourceLineId")] string? SourceLineId,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("quantity")] decimal Quantity,
    [property: JsonPropertyName("unitPrice")] decimal UnitPrice,
    [property: JsonPropertyName("taxRate")] decimal TaxRate,
    [property: JsonPropertyName("nominalCode")] string NominalCode,
    [property: JsonPropertyName("taxCode")] string TaxCode,
    [property: JsonPropertyName("net")] decimal Net,
    [property: JsonPropertyName("tax")] decimal Tax,
    [property: JsonPropertyName("gross")] decimal Gross);

public sealed record InvoiceExportTotals(
    [property: JsonPropertyName("net")] decimal Net,
    [property: JsonPropertyName("tax")] decimal Tax,
    [property: JsonPropertyName("gross")] decimal Gross);
