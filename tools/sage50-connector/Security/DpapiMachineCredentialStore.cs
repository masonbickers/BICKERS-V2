using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Security;

public sealed class DpapiMachineCredentialStore(
    IOptions<ConnectorOptions> options,
    ILogger<DpapiMachineCredentialStore> logger) : IMachineCredentialStore
{
    private readonly ConnectorOptions _options = options.Value;
    private readonly string _path = options.Value.ResolveCredentialFilePath();

    public bool Exists() => File.Exists(_path);

    public async Task StoreAsync(string credential, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Machine credentials can only be stored on Windows.");
        }
        if (string.IsNullOrWhiteSpace(credential) || credential.Length < 32)
        {
            throw new InvalidOperationException("Connector credential is missing or invalid.");
        }

        var clear = Encoding.UTF8.GetBytes(credential.Trim());
        try
        {
            var protectedBytes = ProtectedData.Protect(
                clear,
                Entropy(),
                DataProtectionScope.LocalMachine);
            var directory = Path.GetDirectoryName(_path)
                ?? throw new InvalidOperationException("Credential directory is invalid.");
            Directory.CreateDirectory(directory);
            var temporaryPath = $"{_path}.{Guid.NewGuid():N}.tmp";
            await File.WriteAllTextAsync(
                temporaryPath,
                Convert.ToBase64String(protectedBytes),
                Encoding.ASCII,
                cancellationToken);
            ApplyRestrictedAcl(temporaryPath);
            File.Move(temporaryPath, _path, true);
            ApplyRestrictedAcl(_path);
            logger.LogInformation("Connector machine credential stored at {CredentialPath}.", _path);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    public async Task<string> ReadAsync(CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Machine credentials can only be read on Windows.");
        }
        if (!File.Exists(_path))
        {
            throw new FileNotFoundException(
                "Connector credential is not installed. Run with --set-credential first.",
                _path);
        }
        var encoded = await File.ReadAllTextAsync(_path, cancellationToken);
        var protectedBytes = Convert.FromBase64String(encoded.Trim());
        var clear = ProtectedData.Unprotect(
            protectedBytes,
            Entropy(),
            DataProtectionScope.LocalMachine);
        try
        {
            return Encoding.UTF8.GetString(clear);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clear);
        }
    }

    private byte[] Entropy() =>
        SHA256.HashData(Encoding.UTF8.GetBytes(
            $"BickersAction.Sage50Connector|{_options.ConnectorId}"));

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
