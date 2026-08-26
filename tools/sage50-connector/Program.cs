using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Hosting;
using BickersAction.Sage50Connector.Sage;
using BickersAction.Sage50Connector.Security;
using BickersAction.Sage50Connector.Transport;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Options;

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});
builder.Services
    .AddOptions<ConnectorOptions>()
    .Bind(builder.Configuration.GetSection(ConnectorOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "Bickers Action Sage 50 Connector";
});
builder.Services.AddSingleton<IMachineCredentialStore, DpapiMachineCredentialStore>();
builder.Services.AddSingleton<ISageCompanyCredentialStore, DpapiSageCompanyCredentialStore>();
builder.Services.AddSingleton<ISageInstallationDiscovery, WindowsSageInstallationDiscovery>();
builder.Services.AddSingleton<TrustedAdapterLoader>();
builder.Services.AddSingleton<ISageAdapterCatalog, SageAdapterCatalog>();
builder.Services.AddSingleton<ISageInvoiceWriterCatalog, SageInvoiceWriterCatalog>();
builder.Services
    .AddHttpClient<IConnectorApiClient, ConnectorApiClient>()
    .ConfigureHttpClient((services, client) =>
    {
        var options = services.GetRequiredService<IOptions<ConnectorOptions>>().Value;
        client.Timeout = TimeSpan.FromSeconds(options.ApiRequestTimeoutSeconds);
    });
builder.Services.AddHostedService<ConnectorWorker>();
builder.Services.AddHostedService<CustomerLookupWorker>();
builder.Services.AddHostedService<InvoiceExportWorker>();

using var host = builder.Build();
if (await CredentialBootstrapper.TryHandleAsync(args, host.Services, CancellationToken.None))
{
    return;
}
await host.RunAsync();
