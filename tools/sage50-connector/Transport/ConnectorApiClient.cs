using System.Net.Http.Json;
using System.Text.Json;
using BickersAction.Sage50Connector.Configuration;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Transport;

public sealed class ConnectorApiClient(
    HttpClient httpClient,
    IOptions<ConnectorOptions> options) : IConnectorApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConnectorOptions _options = options.Value;

    public async Task<HeartbeatResponse> SendHeartbeatAsync(
        HeartbeatRequest heartbeat,
        string machineCredential,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            new Uri(_options.ApiBaseUri(), "/api/integrations/sage50/connectors/heartbeat"));
        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", machineCredential);
        request.Headers.Add("X-Sage-Connector-Id", _options.ConnectorId);
        request.Content = JsonContent.Create(heartbeat, options: JsonOptions);

        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new ConnectorApiException(
                (int)response.StatusCode,
                $"Heartbeat API returned HTTP {(int)response.StatusCode}.");
        }
        var parsed = JsonSerializer.Deserialize<HeartbeatResponse>(body, JsonOptions);
        if (parsed is null || !parsed.Ok ||
            !string.Equals(parsed.ConnectorId, _options.ConnectorId, StringComparison.Ordinal))
        {
            throw new ConnectorApiException(502, "Heartbeat API returned an invalid connector identity.");
        }
        return parsed;
    }

    public async Task<CustomerLookupClaimResponse> ClaimCustomerLookupAsync(
        string machineCredential,
        CancellationToken cancellationToken)
    {
        using var request = Request(
            HttpMethod.Post,
            "/api/integrations/sage50/customer-lookups/claim",
            machineCredential);
        request.Content = JsonContent.Create(new { }, options: JsonOptions);
        return await SendAsync<CustomerLookupClaimResponse>(request, cancellationToken);
    }

    public Task StartCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "customer-lookups",
            lookupJobId,
            "started",
            leaseToken,
            machineCredential,
            new { },
            cancellationToken);

    public Task CompleteCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        IReadOnlyList<CustomerLookupResultPayload> results,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "customer-lookups",
            lookupJobId,
            "succeeded",
            leaseToken,
            machineCredential,
            new { results },
            cancellationToken);

    public Task FailCustomerLookupAsync(
        string lookupJobId,
        string leaseToken,
        string code,
        string message,
        bool retryable,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "customer-lookups",
            lookupJobId,
            "failed",
            leaseToken,
            machineCredential,
            new { code, message, retryable },
            cancellationToken);

    public async Task<InvoiceExportClaimResponse> ClaimInvoiceExportAsync(
        string machineCredential,
        CancellationToken cancellationToken)
    {
        using var request = Request(
            HttpMethod.Post,
            "/api/integrations/sage50/export-jobs/claim",
            machineCredential);
        request.Content = JsonContent.Create(new { }, options: JsonOptions);
        return await SendAsync<InvoiceExportClaimResponse>(request, cancellationToken);
    }

    public Task StartInvoiceExportAsync(
        string queueJobId,
        string leaseToken,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "export-jobs",
            queueJobId,
            "started",
            leaseToken,
            machineCredential,
            new { },
            cancellationToken);

    public Task CompleteInvoiceExportAsync(
        string queueJobId,
        string leaseToken,
        string sageInvoiceId,
        string invoiceNumber,
        DateOnly postedDate,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "export-jobs",
            queueJobId,
            "succeeded",
            leaseToken,
            machineCredential,
            new
            {
                sageInvoiceId,
                invoiceNumber,
                postedDate = postedDate.ToString("yyyy-MM-dd")
            },
            cancellationToken);

    public Task FailInvoiceExportAsync(
        string queueJobId,
        string leaseToken,
        string code,
        string message,
        bool retryable,
        string machineCredential,
        CancellationToken cancellationToken) =>
        SendWithoutResultAsync(
            "export-jobs",
            queueJobId,
            "failed",
            leaseToken,
            machineCredential,
            new { code, message, retryable },
            cancellationToken);

    private async Task SendWithoutResultAsync(
        string resource,
        string jobId,
        string action,
        string leaseToken,
        string machineCredential,
        object body,
        CancellationToken cancellationToken)
    {
        using var request = Request(
            HttpMethod.Post,
            $"/api/integrations/sage50/{resource}/{Uri.EscapeDataString(jobId)}/{action}",
            machineCredential);
        request.Headers.Add("X-Sage-Lease-Token", leaseToken);
        request.Content = JsonContent.Create(body, options: JsonOptions);
        _ = await SendAsync<JsonElement>(request, cancellationToken);
    }

    private HttpRequestMessage Request(
        HttpMethod method,
        string path,
        string machineCredential)
    {
        var request = new HttpRequestMessage(method, new Uri(_options.ApiBaseUri(), path));
        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", machineCredential);
        request.Headers.Add("X-Sage-Connector-Id", _options.ConnectorId);
        return request;
    }

    private async Task<T> SendAsync<T>(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new ConnectorApiException(
                (int)response.StatusCode,
                $"Connector API returned HTTP {(int)response.StatusCode}.");
        }
        return JsonSerializer.Deserialize<T>(body, JsonOptions)
            ?? throw new ConnectorApiException(502, "Connector API returned an invalid response.");
    }
}

public sealed class ConnectorApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
