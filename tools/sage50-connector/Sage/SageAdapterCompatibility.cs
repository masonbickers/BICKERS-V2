using BickersAction.Sage50Connector.Configuration;

namespace BickersAction.Sage50Connector.Sage;

public sealed record SageCompatibilityFailure(string Code, string Message);

public static class SageAdapterCompatibility
{
    public static SageCompatibilityFailure? ValidateInstallation(
        ConnectorOptions options,
        SageInstallationSnapshot installation)
    {
        if (string.IsNullOrWhiteSpace(options.ExpectedSageVersion) ||
            !string.Equals(
                installation.SageVersion,
                options.ExpectedSageVersion.Trim(),
                StringComparison.OrdinalIgnoreCase))
        {
            return new("sage_version_mismatch",
                "The detected Sage version does not match the administrator-approved version.");
        }
        if (string.IsNullOrWhiteSpace(options.ExpectedSdoVersion))
        {
            return new("sdo_version_binding_required",
                "The exact SDO build must be captured and configured before an adapter can be enabled.");
        }
        if (!string.Equals(
            installation.SdoVersion,
            options.ExpectedSdoVersion.Trim(),
            StringComparison.OrdinalIgnoreCase))
        {
            return new("sdo_version_mismatch",
                "The detected SDO build does not match the administrator-approved build.");
        }
        if (string.IsNullOrWhiteSpace(options.ExpectedProcessArchitecture))
        {
            return new("process_architecture_binding_required",
                "The connector process architecture must be captured and configured before an adapter can be enabled.");
        }
        if (!string.Equals(
            installation.ProcessArchitecture,
            options.ExpectedProcessArchitecture.Trim(),
            StringComparison.OrdinalIgnoreCase))
        {
            return new("process_architecture_mismatch",
                "The connector process architecture does not match the administrator-approved architecture.");
        }
        return null;
    }

    public static bool MatchesAdapter(
        SageInstallationSnapshot installation,
        string supportedSageVersion,
        string supportedSdoVersion,
        string supportedProcessArchitecture) =>
        string.Equals(installation.SageVersion, supportedSageVersion, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(installation.SdoVersion, supportedSdoVersion, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(
            installation.ProcessArchitecture,
            supportedProcessArchitecture,
            StringComparison.OrdinalIgnoreCase);
}
