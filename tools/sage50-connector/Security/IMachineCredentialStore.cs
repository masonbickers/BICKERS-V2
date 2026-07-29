namespace BickersAction.Sage50Connector.Security;

public interface IMachineCredentialStore
{
    Task StoreAsync(string credential, CancellationToken cancellationToken);
    Task<string> ReadAsync(CancellationToken cancellationToken);
    bool Exists();
}
