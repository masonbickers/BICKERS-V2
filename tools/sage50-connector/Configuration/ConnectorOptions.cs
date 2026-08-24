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
    public string SageAdapter { get; init; } = "auto";
    public string SageWriteAdapter { get; init; } = "auto";
    public bool EnableInvoicePosting { get; init; } = false;
    public string ExpectedSageCompanyIdentifier { get; init; } = "";

    public string AdapterDirectory { get; init; } = "adapters";
    public string CredentialFilePath { get; init; } = "";
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
}
