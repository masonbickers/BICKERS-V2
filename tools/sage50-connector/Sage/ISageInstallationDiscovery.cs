namespace BickersAction.Sage50Connector.Sage;

public interface ISageInstallationDiscovery
{
    Task<SageInstallationSnapshot> DiscoverAsync(CancellationToken cancellationToken);
}
