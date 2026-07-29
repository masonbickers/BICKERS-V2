namespace BickersAction.Sage50Connector.Sage;

// Version-specific adapters are deployed as signed/controlled plugin assemblies.
// Implementations must never expose create, update or delete operations.
public interface ISage50ReadOnlyAdapter
{
    string AdapterName { get; }
    string CapabilityMode { get; }
    bool CanHandle(SageInstallationSnapshot installation);
    Task<SageReadOnlyConnectionResult> TestConnectionAsync(
        string companyDataPath,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<SageCustomerLookupResult>> SearchCustomersAsync(
        string companyDataPath,
        SageCustomerLookupQuery query,
        CancellationToken cancellationToken);
}
