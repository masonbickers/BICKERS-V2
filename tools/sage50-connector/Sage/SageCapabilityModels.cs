namespace BickersAction.Sage50Connector.Sage;

public sealed record DiscoveredComponent(
    string Name,
    string Version,
    string Source);

public sealed record SageInstallationSnapshot(
    IReadOnlyList<DiscoveredComponent> SageProducts,
    IReadOnlyList<DiscoveredComponent> SdoComponents,
    string ProcessArchitecture)
{
    public string? SageVersion => SageProducts.FirstOrDefault()?.Version;
    public string? SdoVersion => SdoComponents.FirstOrDefault()?.Version;
}

public sealed record SageReadOnlyConnectionResult(
    bool Connected,
    string? CompanyName,
    string? CompanyIdentifier,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static SageReadOnlyConnectionResult Unsupported(string code, string message) =>
        new(false, null, null, code, message);
}

public sealed record SageCapabilityReport(
    string Status,
    string? SageVersion,
    string? SdoVersion,
    string? ProcessArchitecture,
    string? CompanyName,
    string? CompanyIdentifier,
    string? AdapterName,
    IReadOnlyList<string> Capabilities,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record SageCustomerLookupQuery(string SearchText, int MaxResults);

public sealed record SageConnectionContext(
    string CompanyDataPath,
    string ExpectedCompanyIdentifier,
    string Username,
    string Password);

public sealed record SageCustomerLookupResult(
    string SageCustomerId,
    string AccountReference,
    string Name,
    string? AddressSummary,
    string? Postcode,
    string? Email,
    string? Phone,
    string? Currency,
    bool IsActive);
