using System.Reflection;
using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Sage;
using BickersAction.Sage50Connector.Security;
using BickersAction.Sage50Connector.Transport;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Hosting;

public sealed class ConnectorWorker(
    IOptions<ConnectorOptions> options,
    IMachineCredentialStore credentialStore,
    ISageAdapterCatalog sageAdapterCatalog,
    IConnectorApiClient apiClient,
    IHostApplicationLifetime lifetime,
    ILogger<ConnectorWorker> logger) : BackgroundService
{
    private readonly ConnectorOptions _options = options.Value;
    private readonly TimeSpan[] _retrySchedule =
    [
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30),
        TimeSpan.FromSeconds(60)
    ];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _ = _options.ApiBaseUri();
        if (!credentialStore.Exists())
        {
            logger.LogCritical(
                "Connector credential is not installed. Run the connector interactively with --set-credential.");
            lifetime.StopApplication();
            return;
        }
        var credential = await credentialStore.ReadAsync(stoppingToken);
        var interval = TimeSpan.FromSeconds(_options.HeartbeatIntervalSeconds);
        var consecutiveFailures = 0;
        logger.LogInformation(
            "Sage 50 connector {ConnectorId} started on {MachineName}; heartbeat interval is {HeartbeatSeconds}s.",
            _options.ConnectorId,
            Environment.MachineName,
            _options.HeartbeatIntervalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var capability = await sageAdapterCatalog
                    .CheckReadOnlyCapabilityAsync(stoppingToken);
                var heartbeat = BuildHeartbeat(capability);
                var response = await apiClient.SendHeartbeatAsync(
                    heartbeat,
                    credential,
                    stoppingToken);
                consecutiveFailures = 0;
                logger.LogInformation(
                    "Heartbeat accepted at {ServerTime}; connector health is {ConnectorStatus}.",
                    response.ServerTime,
                    heartbeat.Status);
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                consecutiveFailures++;
                var retry = _retrySchedule[Math.Min(
                    consecutiveFailures - 1,
                    _retrySchedule.Length - 1)];
                if (retry > interval) retry = interval;
                logger.LogWarning(
                    error,
                    "Heartbeat attempt failed; retrying in {RetrySeconds}s (failure {FailureCount}).",
                    retry.TotalSeconds,
                    consecutiveFailures);
                await Task.Delay(retry, stoppingToken);
            }
        }
        logger.LogInformation("Sage 50 connector stopped gracefully.");
    }

    private static HeartbeatRequest BuildHeartbeat(SageCapabilityReport report)
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "unknown";
        return new HeartbeatRequest(
            Safe(report.Status, 20) ?? "error",
            Safe(Environment.MachineName, 120) ?? "unknown",
            Safe(version, 60) ?? "unknown",
            Safe(report.SageVersion, 80),
            Safe(report.SdoVersion, 80),
            Safe(report.CompanyName, 160),
            Safe(report.CompanyIdentifier, 160),
            Safe(report.ErrorCode, 80),
            Safe(report.ErrorMessage, 500));
    }

    private static string? Safe(string? value, int maxLength)
    {
        var clean = (value ?? "").Trim();
        return clean.Length == 0 ? null : clean[..Math.Min(clean.Length, maxLength)];
    }
}
