namespace BickersAction.Sage50Connector.Sage;

// Version-specific adapters are deployed as signed/controlled plugin assemblies.
// Implementations must never expose create, update or delete operations.
public interface ISage50ReadOnlyAdapter
{
    string AdapterName { get; }
    string CapabilityMode { get; }
    string SupportedSageVersion { get; }
    string SupportedSdoVersion { get; }
    string SupportedProcessArchitecture { get; }
    bool CanHandle(SageInstallationSnapshot installation);
    Task<SageReadOnlyConnectionResult> TestConnectionAsync(
        SageConnectionContext context,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<SageCustomerLookupResult>> SearchCustomersAsync(
        SageConnectionContext context,
        SageCustomerLookupQuery query,
        CancellationToken cancellationToken);
}
