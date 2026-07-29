using System.Text.Json.Serialization;

namespace BickersAction.Sage50Connector.Transport;

public sealed record CustomerLookupClaim(
    [property: JsonPropertyName("contractVersion")] int ContractVersion,
    [property: JsonPropertyName("product")] string Product,
    [property: JsonPropertyName("operation")] string Operation,
    [property: JsonPropertyName("lookupJobId")] string LookupJobId,
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("maxResults")] int MaxResults,
    [property: JsonPropertyName("attemptCount")] int AttemptCount);

public sealed record CustomerLookupClaimResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("lookup")] CustomerLookupClaim? Lookup,
    [property: JsonPropertyName("leaseToken")] string? LeaseToken,
    [property: JsonPropertyName("leaseExpiresAt")] string? LeaseExpiresAt);

public sealed record CustomerLookupResultPayload(
    [property: JsonPropertyName("sageCustomerId")] string SageCustomerId,
    [property: JsonPropertyName("accountReference")] string AccountReference,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("addressSummary")] string? AddressSummary,
    [property: JsonPropertyName("postcode")] string? Postcode,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("phone")] string? Phone,
    [property: JsonPropertyName("currency")] string? Currency,
    [property: JsonPropertyName("isActive")] bool IsActive);
