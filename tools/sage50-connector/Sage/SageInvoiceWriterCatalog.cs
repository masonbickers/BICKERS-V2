using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Sage;

public sealed class SageInvoiceWriterCatalog(
    IOptions<ConnectorOptions> options,
    ISageInstallationDiscovery discovery,
    TrustedAdapterLoader adapterLoader) : ISageInvoiceWriterCatalog
{
    private readonly ConnectorOptions _options = options.Value;

    public async Task<SageInvoiceWriteCapability> CheckCapabilityAsync(
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
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
        return new(true, adapter.AdapterName, null, null);
    }

    public async Task<SagePostedInvoice?> FindExistingServiceInvoiceAsync(
        string idempotencyKey,
        string draftReference,
        CancellationToken cancellationToken)
    {
        var adapter = await RequireAdapterAsync(cancellationToken);
        return await adapter.FindExistingServiceInvoiceAsync(
            _options.CompanyDataPath,
            _options.ExpectedSageCompanyIdentifier,
            idempotencyKey,
            draftReference,
            cancellationToken);
    }

    public async Task<SagePostedInvoice> CreateServiceInvoiceAsync(
        SageServiceInvoice invoice,
        CancellationToken cancellationToken)
    {
        var adapter = await RequireAdapterAsync(cancellationToken);
        return await adapter.CreateServiceInvoiceAsync(
            _options.CompanyDataPath,
            invoice,
            cancellationToken);
    }

    private async Task<ISage50InvoiceWriteAdapter> RequireAdapterAsync(
        CancellationToken cancellationToken)
    {
        var installation = await discovery.DiscoverAsync(cancellationToken);
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
        return adapter;
    }

    private ISage50InvoiceWriteAdapter? SelectAdapter(SageInstallationSnapshot installation)
    {
        var requested = _options.SageWriteAdapter.Trim();
        var adapters = adapterLoader.Load<ISage50InvoiceWriteAdapter>();
        return (requested.Equals("auto", StringComparison.OrdinalIgnoreCase)
                ? adapters
                : adapters.Where(adapter =>
                    adapter.AdapterName.Equals(requested, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(adapter => adapter.CanHandle(installation));
    }
}
