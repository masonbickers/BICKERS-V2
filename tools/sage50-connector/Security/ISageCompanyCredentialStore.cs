namespace BickersAction.Sage50Connector.Security;

public enum SageCredentialPurpose
{
    ReadOnly,
    InvoiceWrite
}

public sealed record SageCompanyCredential(string Username, string Password);

public interface ISageCompanyCredentialStore
{
    bool Exists(SageCredentialPurpose purpose);
    Task StoreAsync(
        SageCredentialPurpose purpose,
        string username,
        string password,
        CancellationToken cancellationToken);
    Task<SageCompanyCredential> ReadAsync(
        SageCredentialPurpose purpose,
        CancellationToken cancellationToken);
}
