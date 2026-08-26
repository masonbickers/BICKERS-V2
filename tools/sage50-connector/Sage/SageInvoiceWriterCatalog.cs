using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Security;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Sage;

public sealed class SageInvoiceWriterCatalog(
    IOptions<ConnectorOptions> options,
    ISageInstallationDiscovery discovery,
    TrustedAdapterLoader adapterLoader,
    ISageCompanyCredentialStore sageCredentialStore,
    ILogger<SageInvoiceWriterCatalog> logger) : ISageInvoiceWriterCatalog
{
    private readonly ConnectorOptions _options = options.Value;

    public async Task<SageInvoiceWriteCapability> CheckCapabilityAsync(
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
        var compatibilityFailure = SageAdapterCompatibility.ValidateInstallation(_options, installation);
        if (compatibilityFailure is not null)
        {
            return new(false, null, compatibilityFailure.Code, compatibilityFailure.Message);
        }
        var adapter = SelectAdapter(installation);
        if (adapter is null)
        {
            return new(false, null, "invoice_write_adapter_unavailable",
                "No trusted invoice-write adapter supports the detected Sage 50 and SDO versions.");
        }
        if (!adapter.CapabilityMode.Equals("invoice_write", StringComparison.Ordinal))
        {
            return new(false, adapter.AdapterName, "unsafe_write_adapter_rejected",
                "The selected adapter did not declare the invoice-write capability.");
        }
        if (!sageCredentialStore.Exists(SageCredentialPurpose.InvoiceWrite))
        {
            return new(false, adapter.AdapterName, "sage_invoice_write_credential_missing",
                "The dedicated invoice-write Sage credential is not installed.");
        }
        try
        {
            var context = await ConnectionContextAsync(cancellationToken);
            var connection = await adapter.TestConnectionAsync(context, cancellationToken);
            if (!connection.Connected)
            {
                return new(false, adapter.AdapterName,
                    connection.ErrorCode ?? "sage_invoice_write_connection_failed",
                    "The dedicated invoice-write Sage connection test did not succeed.");
            }
            if (string.IsNullOrWhiteSpace(_options.ExpectedSageCompanyIdentifier) ||
                !string.Equals(
                    connection.CompanyIdentifier,
                    _options.ExpectedSageCompanyIdentifier.Trim(),
                    StringComparison.Ordinal))
            {
                return new(false, adapter.AdapterName, "sage_invoice_write_company_mismatch",
                    "The invoice-write Sage user did not connect to the approved company.");
            }
            return new(true, adapter.AdapterName, null, null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            logger.LogError(
                "Invoice-write Sage capability check failed with {ErrorType}.",
                error.GetType().Name);
            return new(false, adapter.AdapterName, "sage_invoice_write_connection_failed",
                "The dedicated invoice-write Sage connection test failed.");
        }
    }

    public async Task<SagePostedInvoice?> FindExistingServiceInvoiceAsync(
        string idempotencyKey,
        string draftReference,
        CancellationToken cancellationToken)
    {
        var (adapter, context) = await RequireAdapterAsync(cancellationToken);
        return await adapter.FindExistingServiceInvoiceAsync(
            context,
            idempotencyKey,
            draftReference,
            cancellationToken);
    }

    public async Task<SagePostedInvoice> CreateServiceInvoiceAsync(
        SageServiceInvoice invoice,
        CancellationToken cancellationToken)
    {
        var (adapter, context) = await RequireAdapterAsync(cancellationToken);
        return await adapter.CreateServiceInvoiceAsync(
            context,
            invoice,
            cancellationToken);
    }

    private async Task<(ISage50InvoiceWriteAdapter Adapter, SageConnectionContext Context)> RequireAdapterAsync(
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
        var compatibilityFailure = SageAdapterCompatibility.ValidateInstallation(_options, installation);
        if (compatibilityFailure is not null)
        {
            throw new SageInvoiceWriteException(
                compatibilityFailure.Code,
                compatibilityFailure.Message);
        }
        var adapter = SelectAdapter(installation)
            ?? throw new SageInvoiceWriteException(
                "invoice_write_adapter_unavailable",
                "No trusted invoice-write adapter supports the detected Sage 50 and SDO versions.");
        if (!adapter.CapabilityMode.Equals("invoice_write", StringComparison.Ordinal))
        {
            throw new SageInvoiceWriteException(
                "unsafe_write_adapter_rejected",
                "The selected adapter did not declare the invoice-write capability.");
        }
        return (adapter, await ConnectionContextAsync(cancellationToken));
    }

    private ISage50InvoiceWriteAdapter? SelectAdapter(SageInstallationSnapshot installation)
    {
        var requested = _options.SageWriteAdapter.Trim();
        var adapters = adapterLoader.Load<ISage50InvoiceWriteAdapter>();
        return (requested.Equals("auto", StringComparison.OrdinalIgnoreCase)
                ? adapters
                : adapters.Where(adapter =>
                    adapter.AdapterName.Equals(requested, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(adapter =>
                SageAdapterCompatibility.MatchesAdapter(
                    installation,
                    adapter.SupportedSageVersion,
                    adapter.SupportedSdoVersion,
                    adapter.SupportedProcessArchitecture) &&
                adapter.CanHandle(installation));
    }

    private async Task<SageConnectionContext> ConnectionContextAsync(
        CancellationToken cancellationToken)
    {
        var credential = await sageCredentialStore.ReadAsync(
            SageCredentialPurpose.InvoiceWrite,
            cancellationToken);
        return new SageConnectionContext(
            _options.CompanyDataPath,
            _options.ExpectedSageCompanyIdentifier.Trim(),
            credential.Username,
            credential.Password);
    }
}
