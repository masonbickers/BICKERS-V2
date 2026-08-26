using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Security;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Sage;

public sealed class SageAdapterCatalog(
    IOptions<ConnectorOptions> options,
    ISageInstallationDiscovery discovery,
    TrustedAdapterLoader adapterLoader,
    ISageCompanyCredentialStore sageCredentialStore,
    ILogger<SageAdapterCatalog> logger) : ISageAdapterCatalog
{
    private readonly ConnectorOptions _options = options.Value;

    public async Task<SageCapabilityReport> CheckReadOnlyCapabilityAsync(
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
        if (installation.SageProducts.Count == 0)
        {
            return Report(installation, "error", "sage_not_found",
                "Sage 50 Accounts UK was not detected.");
        }
        if (installation.SdoComponents.Count == 0)
        {
            return Report(installation, "error", "sdo_not_found",
                "A compatible Sage Data Objects installation was not detected.");
        }
        var compatibilityFailure = SageAdapterCompatibility.ValidateInstallation(_options, installation);
        if (compatibilityFailure is not null)
        {
            return Report(
                installation,
                "degraded",
                compatibilityFailure.Code,
                compatibilityFailure.Message);
        }

        var adapter = SelectAdapter(installation);
        if (adapter is null)
        {
            return Report(installation, "degraded", "unsupported_sage_sdo_version",
                "No configured read-only adapter supports the detected Sage 50 and SDO versions.");
        }
        if (!adapter.CapabilityMode.Equals("read_only", StringComparison.Ordinal))
        {
            return Report(installation, "error", "unsafe_adapter_rejected",
                "The selected adapter did not declare the required read-only capability.");
        }

        try
        {
            if (!sageCredentialStore.Exists(SageCredentialPurpose.ReadOnly))
            {
                return Report(installation, "degraded", "sage_read_only_credential_missing",
                    "The dedicated read-only Sage credential is not installed.");
            }
            var context = await ConnectionContextAsync(cancellationToken);
            var result = await adapter.TestConnectionAsync(context, cancellationToken);
            if (result.Connected && string.IsNullOrWhiteSpace(_options.ExpectedSageCompanyIdentifier))
            {
                return new SageCapabilityReport(
                    "degraded",
                    installation.SageVersion,
                    installation.SdoVersion,
                    installation.ProcessArchitecture,
                    result.CompanyName,
                    result.CompanyIdentifier,
                    adapter.AdapterName,
                    [],
                    "sage_company_binding_required",
                    "An expected Sage company identifier must be configured before the connector can become ready.");
            }
            if (result.Connected && !string.Equals(
                result.CompanyIdentifier,
                _options.ExpectedSageCompanyIdentifier.Trim(),
                StringComparison.Ordinal))
            {
                return new SageCapabilityReport(
                    "error",
                    installation.SageVersion,
                    installation.SdoVersion,
                    installation.ProcessArchitecture,
                    result.CompanyName,
                    result.CompanyIdentifier,
                    adapter.AdapterName,
                    [],
                    "sage_company_binding_mismatch",
                    "The connected Sage company does not match the configured company binding.");
            }
            return new SageCapabilityReport(
                result.Connected ? "online" : "degraded",
                installation.SageVersion,
                installation.SdoVersion,
                installation.ProcessArchitecture,
                result.CompanyName,
                result.CompanyIdentifier,
                adapter.AdapterName,
                result.Connected ? ["read_only_customer_lookup"] : [],
                result.ErrorCode,
                result.Connected
                    ? null
                    : "Read-only Sage company connection test did not succeed.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            logger.LogError(
                "Read-only Sage company capability check failed with {ErrorType}.",
                error.GetType().Name);
            return Report(installation, "error", "sdo_read_only_check_failed",
                "The read-only Sage company capability check failed.");
        }
    }

    public async Task<IReadOnlyList<SageCustomerLookupResult>> SearchCustomersAsync(
        SageCustomerLookupQuery query,
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
        var compatibilityFailure = SageAdapterCompatibility.ValidateInstallation(_options, installation);
        if (compatibilityFailure is not null)
        {
            throw new InvalidOperationException(compatibilityFailure.Message);
        }
        var adapter = SelectAdapter(installation)
            ?? throw new InvalidOperationException(
                "No configured read-only adapter supports the detected Sage 50 and SDO versions.");
        if (!adapter.CapabilityMode.Equals("read_only", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Unsafe Sage adapter rejected.");
        }
        var context = await ConnectionContextAsync(cancellationToken);
        var connection = await adapter.TestConnectionAsync(context, cancellationToken);
        if (!connection.Connected ||
            string.IsNullOrWhiteSpace(_options.ExpectedSageCompanyIdentifier) ||
            !string.Equals(
                connection.CompanyIdentifier,
                _options.ExpectedSageCompanyIdentifier.Trim(),
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Read-only Sage company binding is unavailable.");
        }
        var maxResults = Math.Clamp(query.MaxResults, 1, 25);
        var results = await adapter.SearchCustomersAsync(
            context,
            query with { MaxResults = maxResults },
            cancellationToken);
        return results.Take(maxResults).ToArray();
    }

    private IReadOnlyList<ISage50ReadOnlyAdapter> LoadAdapters()
        => adapterLoader.Load<ISage50ReadOnlyAdapter>();

    private ISage50ReadOnlyAdapter? SelectAdapter(SageInstallationSnapshot installation)
    {
        var adapters = LoadAdapters();
        var requested = _options.SageAdapter.Trim();
        return (requested.Equals("auto", StringComparison.OrdinalIgnoreCase)
                ? adapters
                : adapters.Where(adapter =>
                    adapter.AdapterName.Equals(requested, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(item =>
                SageAdapterCompatibility.MatchesAdapter(
                    installation,
                    item.SupportedSageVersion,
                    item.SupportedSdoVersion,
                    item.SupportedProcessArchitecture) &&
                item.CanHandle(installation));
    }

    private async Task<SageConnectionContext> ConnectionContextAsync(
        CancellationToken cancellationToken)
    {
        var credential = await sageCredentialStore.ReadAsync(
            SageCredentialPurpose.ReadOnly,
            cancellationToken);
        return new SageConnectionContext(
            _options.CompanyDataPath,
            _options.ExpectedSageCompanyIdentifier.Trim(),
            credential.Username,
            credential.Password);
    }

    private static SageCapabilityReport Report(
        SageInstallationSnapshot installation,
        string status,
        string code,
        string message) =>
        new(
            status,
            installation.SageVersion,
            installation.SdoVersion,
            installation.ProcessArchitecture,
            null,
            null,
            null,
            [],
            code,
            message);
}
