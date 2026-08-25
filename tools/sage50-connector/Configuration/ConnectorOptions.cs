using System.ComponentModel.DataAnnotations;

namespace BickersAction.Sage50Connector.Configuration;

public sealed class ConnectorOptions
{
    public const string SectionName = "Connector";

    [Required, Url]
    public string ConnectorApiBaseUrl { get; init; } = "";

    [Required]
    public string ConnectorId { get; init; } = "";

    [Required]
    public string CompanyDataPath { get; init; } = "";

    [Range(30, 3600)]
    public int HeartbeatIntervalSeconds { get; init; } = 60;

    [Range(5, 300)]
    public int LookupPollIntervalSeconds { get; init; } = 10;

    [Range(5, 300)]
    public int InvoicePollIntervalSeconds { get; init; } = 15;

    [Range(5, 120)]
    public int ApiRequestTimeoutSeconds { get; init; } = 30;

    [Required]
    public string SageAdapter { get; init; } = "sage50-v33.1.359.0-readonly";
    public string SageWriteAdapter { get; init; } = "sage50-v33.1.359.0-invoice-write";
    public bool EnableInvoicePosting { get; init; } = false;
    public string ExpectedSageCompanyIdentifier { get; init; } = "";
    public string ExpectedSageVersion { get; init; } = "33.1.359.0";
    public string ExpectedSdoVersion { get; init; } = "";
    public string ExpectedProcessArchitecture { get; init; } = "";

    public string AdapterDirectory { get; init; } = "adapters";
    public string CredentialFilePath { get; init; } = "";
    public string ReadOnlySageCredentialFilePath { get; init; } = "";
    public string InvoiceWriteSageCredentialFilePath { get; init; } = "";
    public string[] SdoSearchPaths { get; init; } = [];
    public string[] SdoFilePatterns { get; init; } = [];
    public string[] TrustedAdapterSha256 { get; init; } = [];

    public Uri ApiBaseUri()
    {
        var uri = new Uri(ConnectorApiBaseUrl, UriKind.Absolute);
        if (uri.Scheme != Uri.UriSchemeHttps && !uri.IsLoopback)
        {
            throw new ValidationException("ConnectorApiBaseUrl must use HTTPS outside local development.");
        }
        return uri;
    }

    public string ResolveAdapterDirectory() =>
        Path.GetFullPath(Path.IsPathRooted(AdapterDirectory)
            ? AdapterDirectory
            : Path.Combine(AppContext.BaseDirectory, AdapterDirectory));

    public string ResolveCredentialFilePath()
    {
        if (!string.IsNullOrWhiteSpace(CredentialFilePath))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(CredentialFilePath));
        }
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "BickersAction",
            "Sage50Connector",
            "connector.credential");
    }

    public string ResolveSageCredentialFilePath(string purpose)
    {
        var configured = purpose.Equals("read_only", StringComparison.Ordinal)
            ? ReadOnlySageCredentialFilePath
            : InvoiceWriteSageCredentialFilePath;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(configured));
        }
        var fileName = purpose.Equals("read_only", StringComparison.Ordinal)
            ? "sage-read-only.credential"
            : "sage-invoice-write.credential";
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "BickersAction",
            "Sage50Connector",
            fileName);
    }
}
