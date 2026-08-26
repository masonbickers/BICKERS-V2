using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Security;

public sealed class DpapiSageCompanyCredentialStore(
    IOptions<ConnectorOptions> options,
    ILogger<DpapiSageCompanyCredentialStore> logger) : ISageCompanyCredentialStore
{
    private readonly ConnectorOptions _options = options.Value;

    public bool Exists(SageCredentialPurpose purpose) => File.Exists(PathFor(purpose));

    public async Task StoreAsync(
        SageCredentialPurpose purpose,
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Sage credentials can only be stored on Windows.");
        }
        var cleanUsername = (username ?? "").Trim();
        if (cleanUsername.Length == 0 || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("A Sage username and password are required.");
        }

        var clear = JsonSerializer.SerializeToUtf8Bytes(new SageCompanyCredential(cleanUsername, password));
        try
        {
            var protectedBytes = ProtectedData.Protect(
                clear,
                Entropy(purpose),
                DataProtectionScope.LocalMachine);
            var path = PathFor(purpose);
            var directory = Path.GetDirectoryName(path)
                ?? throw new InvalidOperationException("Sage credential directory is invalid.");
            Directory.CreateDirectory(directory);
            var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
            await File.WriteAllTextAsync(
                temporaryPath,
                Convert.ToBase64String(protectedBytes),
                Encoding.ASCII,
                cancellationToken);
            ApplyRestrictedAcl(temporaryPath);
            File.Move(temporaryPath, path, true);
            ApplyRestrictedAcl(path);
            logger.LogInformation(
                "The {CredentialPurpose} Sage credential was stored using Windows protection.",
                PurposeName(purpose));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    public async Task<SageCompanyCredential> ReadAsync(
        SageCredentialPurpose purpose,
        CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Sage credentials can only be read on Windows.");
        }
        var path = PathFor(purpose);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"The {PurposeName(purpose)} Sage credential is not installed.",
                path);
        }
        var encoded = await File.ReadAllTextAsync(path, cancellationToken);
        var protectedBytes = Convert.FromBase64String(encoded.Trim());
        var clear = ProtectedData.Unprotect(
            protectedBytes,
            Entropy(purpose),
            DataProtectionScope.LocalMachine);
        try
        {
            return JsonSerializer.Deserialize<SageCompanyCredential>(clear)
                ?? throw new InvalidOperationException("The Sage credential could not be decoded.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    private string PathFor(SageCredentialPurpose purpose) =>
        _options.ResolveSageCredentialFilePath(PurposeName(purpose));

    private byte[] Entropy(SageCredentialPurpose purpose) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(
            $"BickersAction.Sage50Connector|{_options.ConnectorId}|sage|{PurposeName(purpose)}"));

    private static string PurposeName(SageCredentialPurpose purpose) =>
        purpose == SageCredentialPurpose.ReadOnly ? "read_only" : "invoice_write";

    private static void ApplyRestrictedAcl(string path)
    {
        var security = new FileSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            FileSystemRights.FullControl,
            AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            FileSystemRights.FullControl,
            AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(
            WindowsIdentity.GetCurrent().User
                ?? throw new InvalidOperationException("Current Windows identity is unavailable."),
            FileSystemRights.FullControl,
            AccessControlType.Allow));
        new FileInfo(path).SetAccessControl(security);
    }
}
