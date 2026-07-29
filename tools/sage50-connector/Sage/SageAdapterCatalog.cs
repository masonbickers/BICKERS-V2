using System.Reflection;
using System.Runtime.Loader;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Sage;

public sealed class SageAdapterCatalog(
    IOptions<ConnectorOptions> options,
    ISageInstallationDiscovery discovery,
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

        var adapters = LoadAdapters();
        var requested = _options.SageAdapter.Trim();
        var candidates = requested.Equals("auto", StringComparison.OrdinalIgnoreCase)
            ? adapters
            : adapters.Where(adapter =>
                adapter.AdapterName.Equals(requested, StringComparison.OrdinalIgnoreCase));
        var adapter = candidates.FirstOrDefault(item => item.CanHandle(installation));
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
            var result = await adapter.TestConnectionAsync(
                _options.CompanyDataPath,
                cancellationToken);
            return new SageCapabilityReport(
                result.Connected ? "online" : "degraded",
                installation.SageVersion,
                installation.SdoVersion,
                result.CompanyName,
                result.CompanyIdentifier,
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
        var adapter = SelectAdapter(installation)
            ?? throw new InvalidOperationException(
                "No configured read-only adapter supports the detected Sage 50 and SDO versions.");
        if (!adapter.CapabilityMode.Equals("read_only", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Unsafe Sage adapter rejected.");
        }
        var connection = await adapter.TestConnectionAsync(
            _options.CompanyDataPath,
            cancellationToken);
        if (!connection.Connected)
        {
            throw new InvalidOperationException("Read-only Sage company connection is unavailable.");
        }
        var maxResults = Math.Clamp(query.MaxResults, 1, 25);
        var results = await adapter.SearchCustomersAsync(
            _options.CompanyDataPath,
            query with { MaxResults = maxResults },
            cancellationToken);
        return results.Take(maxResults).ToArray();
    }

    private IReadOnlyList<ISage50ReadOnlyAdapter> LoadAdapters()
    {
        var directory = _options.ResolveAdapterDirectory();
        if (!Directory.Exists(directory))
        {
            logger.LogWarning("Sage adapter directory {AdapterDirectory} does not exist.", directory);
            return [];
        }
        var adapters = new List<ISage50ReadOnlyAdapter>();
        foreach (var path in Directory.EnumerateFiles(directory, "*.dll", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(path));
                foreach (var type in assembly.GetTypes().Where(type =>
                    !type.IsAbstract &&
                    typeof(ISage50ReadOnlyAdapter).IsAssignableFrom(type) &&
                    type.GetConstructor(Type.EmptyTypes) is not null))
                {
                    if (Activator.CreateInstance(type) is ISage50ReadOnlyAdapter adapter)
                    {
                        adapters.Add(adapter);
                    }
                }
            }
            catch (Exception error) when (
                error is BadImageFormatException or FileLoadException or ReflectionTypeLoadException)
            {
                logger.LogWarning(
                    "Rejected Sage adapter assembly {AdapterAssembly} ({ErrorType}).",
                    Path.GetFileName(path),
                    error.GetType().Name);
            }
        }
        return adapters;
    }

    private ISage50ReadOnlyAdapter? SelectAdapter(SageInstallationSnapshot installation)
    {
        var adapters = LoadAdapters();
        var requested = _options.SageAdapter.Trim();
        return (requested.Equals("auto", StringComparison.OrdinalIgnoreCase)
                ? adapters
                : adapters.Where(adapter =>
                    adapter.AdapterName.Equals(requested, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(item => item.CanHandle(installation));
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
            null,
            null,
            code,
            message);
}
