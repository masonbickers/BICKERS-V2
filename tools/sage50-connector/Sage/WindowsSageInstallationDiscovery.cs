using System.Diagnostics;
using System.Runtime.InteropServices;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.Win32;

namespace BickersAction.Sage50Connector.Sage;

public sealed class WindowsSageInstallationDiscovery(
    IOptions<ConnectorOptions> options,
    ILogger<WindowsSageInstallationDiscovery> logger) : ISageInstallationDiscovery
{
    private readonly ConnectorOptions _options = options.Value;

    public Task<SageInstallationSnapshot> DiscoverAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!OperatingSystem.IsWindows())
        {
            return Task.FromResult(new SageInstallationSnapshot([], [], "unknown"));
        }

        var installed = ReadInstalledProducts();
        var sage = installed
            .Where(item => item.Name.Contains("Sage 50 Accounts", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        var sdo = installed
            .Where(item =>
                item.Name.Contains("Sage Data Objects", StringComparison.OrdinalIgnoreCase) ||
                item.Name.Contains("SDO", StringComparison.OrdinalIgnoreCase))
            .Concat(ReadConfiguredSdoFiles())
            .DistinctBy(item => $"{item.Name}|{item.Version}|{item.Source}")
            .ToArray();
        logger.LogInformation(
            "Sage discovery found {SageCount} Sage 50 installation(s) and {SdoCount} SDO component(s).",
            sage.Length,
            sdo.Length);
        return Task.FromResult(new SageInstallationSnapshot(
            sage,
            sdo,
            RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant()));
    }

    private static IEnumerable<DiscoveredComponent> ReadInstalledProducts()
    {
        const string uninstall = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var root = baseKey.OpenSubKey(uninstall);
            if (root is null) continue;
            foreach (var subKeyName in root.GetSubKeyNames())
            {
                using var product = root.OpenSubKey(subKeyName);
                var name = Convert.ToString(product?.GetValue("DisplayName"))?.Trim();
                if (string.IsNullOrWhiteSpace(name)) continue;
                var version = Convert.ToString(product?.GetValue("DisplayVersion"))?.Trim() ?? "";
                yield return new DiscoveredComponent(name, version, $"registry:{view}");
            }
        }
    }

    private IEnumerable<DiscoveredComponent> ReadConfiguredSdoFiles()
    {
        foreach (var rawPath in _options.SdoSearchPaths)
        {
            var path = Environment.ExpandEnvironmentVariables(rawPath);
            if (!Directory.Exists(path)) continue;
            foreach (var pattern in _options.SdoFilePatterns.Where(value => !string.IsNullOrWhiteSpace(value)))
            {
                IEnumerable<string> files;
                try
                {
                    files = Directory.EnumerateFiles(path, pattern, SearchOption.AllDirectories);
                }
                catch (Exception error)
                {
                    logger.LogWarning(error, "Could not inspect configured SDO path {SdoPath}.", path);
                    continue;
                }
                foreach (var file in files)
                {
                    FileVersionInfo version;
                    try
                    {
                        version = FileVersionInfo.GetVersionInfo(file);
                    }
                    catch
                    {
                        continue;
                    }
                    yield return new DiscoveredComponent(
                        version.ProductName ?? Path.GetFileName(file),
                        version.FileVersion ?? version.ProductVersion ?? "",
                        $"file:{Path.GetFileName(file)}");
                }
            }
        }
    }
}
