using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Sage;
using BickersAction.Sage50Connector.Security;
using BickersAction.Sage50Connector.Transport;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Hosting;

public sealed class CustomerLookupWorker(
    IOptions<ConnectorOptions> options,
    IMachineCredentialStore credentialStore,
    ISageAdapterCatalog sageAdapterCatalog,
    IConnectorApiClient apiClient,
    ILogger<CustomerLookupWorker> logger) : BackgroundService
{
    private readonly ConnectorOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!credentialStore.Exists()) return;
        var credential = await credentialStore.ReadAsync(stoppingToken);
        var interval = TimeSpan.FromSeconds(_options.LookupPollIntervalSeconds);
        logger.LogInformation(
            "Read-only Sage customer lookup polling started at {PollSeconds}s intervals.",
            interval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var claim = await apiClient.ClaimCustomerLookupAsync(
                    credential,
                    stoppingToken);
                if (claim.Lookup is not null && !string.IsNullOrWhiteSpace(claim.LeaseToken))
                {
                    await ProcessAsync(
                        claim.Lookup,
                        claim.LeaseToken,
                        credential,
                        stoppingToken);
                }
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogWarning(
                    "Customer lookup poll failed with {ErrorType}; retrying in {PollSeconds}s.",
                    error.GetType().Name,
                    interval.TotalSeconds);
                await Task.Delay(interval, stoppingToken);
            }
        }
        logger.LogInformation("Read-only Sage customer lookup polling stopped gracefully.");
    }

    private async Task ProcessAsync(
        CustomerLookupClaim lookup,
        string leaseToken,
        string credential,
        CancellationToken cancellationToken)
    {
        if (
            lookup.ContractVersion != 1 ||
            lookup.Product != "sage_50_accounts_uk" ||
            lookup.Operation != "search_customers_read_only" ||
            lookup.Query.Trim().Length < 2)
        {
            await apiClient.FailCustomerLookupAsync(
                lookup.LookupJobId,
                leaseToken,
                "invalid_lookup_contract",
                "Customer lookup contract was rejected.",
                false,
                credential,
                cancellationToken);
            return;
        }

        try
        {
            await apiClient.StartCustomerLookupAsync(
                lookup.LookupJobId,
                leaseToken,
                credential,
                cancellationToken);
            var results = await sageAdapterCatalog.SearchCustomersAsync(
                new SageCustomerLookupQuery(lookup.Query, Math.Clamp(lookup.MaxResults, 1, 25)),
                cancellationToken);
            var safeResults = results.Take(25).Select(ToSafePayload).ToArray();
            await apiClient.CompleteCustomerLookupAsync(
                lookup.LookupJobId,
                leaseToken,
                safeResults,
                credential,
                cancellationToken);
            logger.LogInformation(
                "Customer lookup {LookupJobId} completed with {ResultCount} safe result(s).",
                lookup.LookupJobId,
                safeResults.Length);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            logger.LogWarning(
                "Customer lookup {LookupJobId} failed with {ErrorType}.",
                lookup.LookupJobId,
                error.GetType().Name);
            try
            {
                await apiClient.FailCustomerLookupAsync(
                    lookup.LookupJobId,
                    leaseToken,
                    "read_only_customer_lookup_failed",
                    "Read-only Sage customer lookup failed.",
                    true,
                    credential,
                    cancellationToken);
            }
            catch (Exception callbackError)
            {
                logger.LogWarning(
                    "Customer lookup failure callback failed with {ErrorType}.",
                    callbackError.GetType().Name);
            }
        }
    }

    private static CustomerLookupResultPayload ToSafePayload(SageCustomerLookupResult result) =>
        new(
            Safe(result.SageCustomerId, 80),
            Safe(result.AccountReference, 80),
            Safe(result.Name, 160),
            Optional(result.AddressSummary, 240),
            Optional(result.Postcode, 20),
            Optional(result.Email, 254)?.ToLowerInvariant(),
            Optional(result.Phone, 40),
            Optional(result.Currency, 8)?.ToUpperInvariant(),
            result.IsActive);

    private static string Safe(string? value, int maxLength)
    {
        var clean = (value ?? "").Trim();
        if (clean.Length == 0) throw new InvalidOperationException("Sage customer result identity is missing.");
        return clean[..Math.Min(clean.Length, maxLength)];
    }

    private static string? Optional(string? value, int maxLength)
    {
        var clean = (value ?? "").Trim();
        return clean.Length == 0 ? null : clean[..Math.Min(clean.Length, maxLength)];
    }
}
