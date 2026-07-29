namespace BickersAction.Sage50Connector.Sage;

public interface ISageAdapterCatalog
{
    Task<SageCapabilityReport> CheckReadOnlyCapabilityAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<SageCustomerLookupResult>> SearchCustomersAsync(
        SageCustomerLookupQuery query,
        CancellationToken cancellationToken);
}
