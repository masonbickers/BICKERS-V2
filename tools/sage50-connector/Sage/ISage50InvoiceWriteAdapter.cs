namespace BickersAction.Sage50Connector.Sage;

// Write adapters are version-specific, administrator-approved deployment artifacts.
// The first production contract permits service-invoice creation only.
public interface ISage50InvoiceWriteAdapter
{
    string AdapterName { get; }
    string CapabilityMode { get; }
    bool CanHandle(SageInstallationSnapshot installation);
    Task<SagePostedInvoice?> FindExistingServiceInvoiceAsync(
        string companyDataPath,
        string expectedSageCompanyIdentifier,
        string idempotencyKey,
        string draftReference,
        CancellationToken cancellationToken);
    Task<SagePostedInvoice> CreateServiceInvoiceAsync(
        string companyDataPath,
        SageServiceInvoice invoice,
        CancellationToken cancellationToken);
}

public sealed record SageServiceInvoice(
    string ExpectedSageCompanyIdentifier,
    string IdempotencyKey,
    string DraftReference,
    DateOnly InvoiceDate,
    string Currency,
    string SageCustomerId,
    string LegalName,
    string? PurchaseOrderNumber,
    int PaymentTermsDays,
    string JobNumber,
    string SourceQuoteNumber,
    IReadOnlyList<SageServiceInvoiceLine> Lines,
    decimal Net,
    decimal Tax,
    decimal Gross);

public sealed record SageServiceInvoiceLine(
    int LineNumber,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal TaxRate,
    string NominalCode,
    string TaxCode,
    decimal Net,
    decimal Tax,
    decimal Gross);

public sealed record SagePostedInvoice(
    string SageInvoiceId,
    string InvoiceNumber,
    DateOnly PostedDate);

public sealed class SageInvoiceWriteException(
    string code,
    string message,
    bool retryable = false) : Exception(message)
{
    public string Code { get; } = code;
    public bool Retryable { get; } = retryable;
}
