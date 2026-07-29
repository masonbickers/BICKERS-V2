using System.Text.Json.Serialization;

namespace BickersAction.Sage50Connector.Transport;

public sealed record HeartbeatRequest(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("machineName")] string MachineName,
    [property: JsonPropertyName("connectorVersion")] string ConnectorVersion,
    [property: JsonPropertyName("sageVersion")] string? SageVersion,
    [property: JsonPropertyName("sdoVersion")] string? SdoVersion,
    [property: JsonPropertyName("sageCompanyName")] string? SageCompanyName,
    [property: JsonPropertyName("sageCompanyIdentifier")] string? SageCompanyIdentifier,
    [property: JsonPropertyName("lastErrorCode")] string? LastErrorCode,
    [property: JsonPropertyName("lastErrorMessage")] string? LastErrorMessage);

public sealed record HeartbeatResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("connectorId")] string ConnectorId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("serverTime")] string ServerTime,
    [property: JsonPropertyName("credentialVersion")] int CredentialVersion);
