namespace BickersAction.Sage50Connector.Transport;

public interface IConnectorApiClient
{
    Task<HeartbeatResponse> SendHeartbeatAsync(
        HeartbeatRequest heartbeat,
        string machineCredential,
        CancellationToken cancellationToken);
    Task<CustomerLookupClaimResponse> ClaimCustomerLookupAsync(
        string machineCredential,
        CancellationToken cancellationToken);
    Task StartCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        string machineCredential,
        CancellationToken cancellationToken);
    Task CompleteCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        IReadOnlyList<CustomerLookupResultPayload> results,
        string machineCredential,
        CancellationToken cancellationToken);
    Task FailCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        string code,
        string message,
        bool retryable,
        string machineCredential,
        CancellationToken cancellationToken);
}
