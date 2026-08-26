namespace BickersAction.Sage50Connector.Sage;

public interface ISageInvoiceWriterCatalog
{
    Task<SageInvoiceWriteCapability> CheckCapabilityAsync(CancellationToken cancellationToken);
    Task<SagePostedInvoice?> FindExistingServiceInvoiceAsync(
        string idempotencyKey,
        string draftReference,
        CancellationToken cancellationToken);
    Task<SagePostedInvoice> CreateServiceInvoiceAsync(
        SageServiceInvoice invoice,
        CancellationToken cancellationToken);
}

public sealed record SageInvoiceWriteCapability(
    bool Ready,
    string? AdapterName,
    string? ErrorCode,
    string? ErrorMessage);
