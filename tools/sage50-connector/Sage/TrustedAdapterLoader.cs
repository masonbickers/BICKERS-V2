using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Sage;

public sealed class TrustedAdapterLoader(
    IOptions<ConnectorOptions> options,
    ILogger<TrustedAdapterLoader> logger)
{
    private readonly ConnectorOptions _options = options.Value;

    public IReadOnlyList<TAdapter> Load<TAdapter>() where TAdapter : class
    {
        var directory = _options.ResolveAdapterDirectory();
        if (!Directory.Exists(directory))
        {
            logger.LogWarning("Sage adapter directory {AdapterDirectory} does not exist.", directory);
            return [];
        }
        var trustedHashes = _options.TrustedAdapterSha256
            .Select(NormaliseHash)
            .Where(value => value.Length == 64)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (trustedHashes.Count == 0)
        {
            logger.LogWarning("No trusted Sage adapter SHA-256 hashes are configured.");
            return [];
        }

        var adapters = new List<TAdapter>();
        foreach (var path in Directory.EnumerateFiles(directory, "*.dll", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
                if (!trustedHashes.Contains(hash))
                {
                    logger.LogWarning(
                        "Rejected untrusted Sage adapter assembly {AdapterAssembly}.",
                        Path.GetFileName(path));
                    continue;
                }
                var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(path));
                foreach (var type in assembly.GetTypes().Where(type =>
                    !type.IsAbstract &&
                    typeof(TAdapter).IsAssignableFrom(type) &&
                    type.GetConstructor(Type.EmptyTypes) is not null))
                {
                    if (Activator.CreateInstance(type) is TAdapter adapter)
                    {
                        adapters.Add(adapter);
                    }
                }
            }
            catch (Exception error) when (
                error is BadImageFormatException or FileLoadException or ReflectionTypeLoadException or IOException)
            {
                logger.LogWarning(
                    "Rejected Sage adapter assembly {AdapterAssembly} ({ErrorType}).",
                    Path.GetFileName(path),
                    error.GetType().Name);
            }
        }
        return adapters;
    }

    private static string NormaliseHash(string? value) =>
        (value ?? "").Trim().Replace("-", "", StringComparison.Ordinal).ToUpperInvariant();
}
