using System.Globalization;
using BickersAction.Sage50Connector.Configuration;
using BickersAction.Sage50Connector.Sage;
using BickersAction.Sage50Connector.Security;
using BickersAction.Sage50Connector.Transport;
using Microsoft.Extensions.Options;

namespace BickersAction.Sage50Connector.Hosting;

public sealed class InvoiceExportWorker(
    IOptions<ConnectorOptions> options,
    IMachineCredentialStore credentialStore,
    ISageAdapterCatalog readOnlyCatalog,
    ISageInvoiceWriterCatalog writerCatalog,
    IConnectorApiClient apiClient,
    ILogger<InvoiceExportWorker> logger) : BackgroundService
{
    private readonly ConnectorOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.EnableInvoicePosting)
        {
            logger.LogInformation("Sage invoice posting is disabled by local configuration.");
            return;
        }
        if (!credentialStore.Exists()) return;

        var credential = await credentialStore.ReadAsync(stoppingToken);
        var interval = TimeSpan.FromSeconds(_options.InvoicePollIntervalSeconds);
        logger.LogInformation(
            "Sage invoice export polling started at {PollSeconds}s intervals.",
            interval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var claim = await apiClient.ClaimInvoiceExportAsync(credential, stoppingToken);
                if (claim.Job is not null &&
                    !string.IsNullOrWhiteSpace(claim.QueueJobId) &&
                    !string.IsNullOrWhiteSpace(claim.LeaseToken))
                {
                    await ProcessAsync(
                        claim.QueueJobId,
                        claim.Job,
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
                    "Invoice export poll failed with {ErrorType}; retrying in {PollSeconds}s.",
                    error.GetType().Name,
                    interval.TotalSeconds);
                await Task.Delay(interval, stoppingToken);
            }
        }
        logger.LogInformation("Sage invoice export polling stopped gracefully.");
    }

    private async Task ProcessAsync(
        string queueJobId,
        InvoiceExportJob job,
        string leaseToken,
        string credential,
        CancellationToken cancellationToken)
    {
        SagePostedInvoice? posted = null;
        try
        {
            await apiClient.StartInvoiceExportAsync(
                queueJobId,
                leaseToken,
                credential,
                cancellationToken);
            var invoice = ValidateAndMap(job, _options.ExpectedSageCompanyIdentifier);

            var readCapability = await readOnlyCatalog.CheckReadOnlyCapabilityAsync(cancellationToken);
            if (!readCapability.Status.Equals("online", StringComparison.Ordinal) ||
                !readCapability.Capabilities.Contains("read_only_customer_lookup", StringComparer.Ordinal))
            {
                throw new SageInvoiceWriteException(
                    "sage_read_only_gate_failed",
                    "The Sage company connection is not ready.",
                    true);
            }
            var writeCapability = await writerCatalog.CheckCapabilityAsync(cancellationToken);
            if (!writeCapability.Ready)
            {
                throw new SageInvoiceWriteException(
                    writeCapability.ErrorCode ?? "invoice_write_adapter_unavailable",
                    writeCapability.ErrorMessage ?? "Sage invoice posting is unavailable.");
            }

            var resolved = await writerCatalog.FindExistingServiceInvoiceAsync(
                job.IdempotencyKey,
                job.Invoice.DraftReference,
                cancellationToken);
            resolved ??= await writerCatalog.CreateServiceInvoiceAsync(invoice, cancellationToken);
            var sageInvoiceId = SafeRequired(resolved.SageInvoiceId, 120, "Sage invoice identity");
            var invoiceNumber = SafeRequired(resolved.InvoiceNumber, 80, "Sage invoice number");
            posted = resolved;

            await apiClient.CompleteInvoiceExportAsync(
                queueJobId,
                leaseToken,
                sageInvoiceId,
                invoiceNumber,
                resolved.PostedDate,
                credential,
                cancellationToken);
            logger.LogInformation(
                "Sage invoice export {QueueJobId} completed successfully.",
                queueJobId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error) when (posted is not null)
        {
            // Sage already contains the invoice. Leave the lease to expire so the
            // next claim resolves it through the adapter's idempotency lookup.
            logger.LogWarning(
                "Sage invoice export {QueueJobId} was posted but its success callback failed with {ErrorType}; replay will reconcile the existing invoice.",
                queueJobId,
                error.GetType().Name);
        }
        catch (InvoiceExportValidationException error)
        {
            await ReportFailureAsync(
                queueJobId,
                leaseToken,
                error.Code,
                error.Message,
                false,
                credential,
                cancellationToken);
        }
        catch (SageInvoiceWriteException error)
        {
            await ReportFailureAsync(
                queueJobId,
                leaseToken,
                error.Code,
                error.Message,
                error.Retryable,
                credential,
                cancellationToken);
        }
        catch (Exception error)
        {
            logger.LogWarning(
                "Sage invoice export {QueueJobId} failed with {ErrorType}.",
                queueJobId,
                error.GetType().Name);
            await ReportFailureAsync(
                queueJobId,
                leaseToken,
                "sage_invoice_write_failed",
                "Sage service-invoice creation failed.",
                true,
                credential,
                cancellationToken);
        }
    }

    private async Task ReportFailureAsync(
        string queueJobId,
        string leaseToken,
        string code,
        string message,
        bool retryable,
        string credential,
        CancellationToken cancellationToken)
    {
        try
        {
            await apiClient.FailInvoiceExportAsync(
                queueJobId,
                leaseToken,
                SafeRequired(code, 80, "Failure code"),
                SafeRequired(message, 500, "Failure message"),
                retryable,
                credential,
                cancellationToken);
        }
        catch (Exception callbackError)
        {
            logger.LogWarning(
                "Invoice export failure callback failed with {ErrorType}.",
                callbackError.GetType().Name);
        }
    }

    private static SageServiceInvoice ValidateAndMap(
        InvoiceExportJob job,
        string expectedSageCompanyIdentifier)
    {
        if (job.ContractVersion != 2 ||
            !job.Product.Equals("sage_50_accounts_uk", StringComparison.Ordinal) ||
            !job.Operation.Equals("create_sales_invoice", StringComparison.Ordinal))
        {
            throw Invalid("invalid_invoice_contract", "The invoice export contract was rejected.");
        }
        _ = SafeRequired(job.JobId, 180, "Job identity");
        _ = SafeRequired(job.IdempotencyKey, 220, "Idempotency key");
        _ = SafeRequired(job.TenantId, 180, "Tenant identity");
        var payload = job.Invoice ?? throw Invalid(
            "invalid_invoice_payload", "The invoice payload is required.");
        var customer = payload.Customer ?? throw Invalid(
            "invalid_invoice_customer", "The mapped Sage customer is required.");
        var totals = payload.Totals ?? throw Invalid(
            "invalid_invoice_totals", "Invoice totals are required.");
        if (!DateOnly.TryParseExact(
            payload.InvoiceDate,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var invoiceDate))
        {
            throw Invalid("invalid_invoice_date", "The invoice date must use YYYY-MM-DD.");
        }
        if (payload.PaymentTermsDays is < 0 or > 365)
        {
            throw Invalid("invalid_payment_terms", "Payment terms must be between 0 and 365 days.");
        }
        if (payload.Lines is null || payload.Lines.Count is < 1 or > 250)
        {
            throw Invalid("invalid_invoice_lines", "The invoice must contain between 1 and 250 lines.");
        }

        var lines = payload.Lines.Select((line, index) =>
        {
            if (line.LineNumber != index + 1 || line.Quantity <= 0 || line.TaxRate is < 0 or > 100)
            {
                throw Invalid("invalid_invoice_line", "An invoice line failed structural validation.");
            }
            var net = Money(line.Quantity * line.UnitPrice);
            var tax = Money(net * (line.TaxRate / 100m));
            var gross = Money(net + tax);
            if (net != Money(line.Net) || tax != Money(line.Tax) || gross != Money(line.Gross))
            {
                throw Invalid("invoice_line_total_mismatch", "An invoice line total did not match its calculated value.");
            }
            return new SageServiceInvoiceLine(
                line.LineNumber,
                SafeRequired(line.Description, 500, "Line description"),
                line.Quantity,
                line.UnitPrice,
                line.TaxRate,
                SafeRequired(line.NominalCode, 40, "Nominal code"),
                SafeRequired(line.TaxCode, 40, "Tax code"),
                net,
                tax,
                gross);
        }).ToArray();

        var netTotal = Money(lines.Sum(line => line.Net));
        var taxTotal = Money(lines.Sum(line => line.Tax));
        var grossTotal = Money(lines.Sum(line => line.Gross));
        if (netTotal != Money(totals.Net) ||
            taxTotal != Money(totals.Tax) ||
            grossTotal != Money(totals.Gross))
        {
            throw Invalid("invoice_total_mismatch", "Invoice totals did not match the calculated line totals.");
        }

        return new SageServiceInvoice(
            SafeRequired(expectedSageCompanyIdentifier, 160, "Expected Sage company identifier"),
            SafeRequired(job.IdempotencyKey, 220, "Idempotency key"),
            SafeRequired(payload.DraftReference, 120, "Draft reference"),
            invoiceDate,
            SafeRequired(payload.Currency, 8, "Currency").ToUpperInvariant(),
            SafeRequired(customer.SageCustomerId, 80, "Sage customer identity"),
            SafeRequired(customer.LegalName, 160, "Customer legal name"),
            SafeOptional(payload.PurchaseOrderNumber, 120),
            payload.PaymentTermsDays,
            SafeRequired(payload.JobNumber, 120, "Job number"),
            SafeRequired(payload.SourceQuoteNumber, 120, "Source quote number"),
            lines,
            netTotal,
            taxTotal,
            grossTotal);
    }

    private static decimal Money(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static string SafeRequired(string? value, int maxLength, string label)
    {
        var clean = (value ?? "").Trim();
        if (clean.Length == 0 || clean.Length > maxLength)
        {
            throw Invalid("invalid_invoice_payload", $"{label} is missing or too long.");
        }
        return clean;
    }

    private static string? SafeOptional(string? value, int maxLength)
    {
        var clean = (value ?? "").Trim();
        if (clean.Length > maxLength)
        {
            throw Invalid("invalid_invoice_payload", "An optional invoice field is too long.");
        }
        return clean.Length == 0 ? null : clean;
    }

    private static InvoiceExportValidationException Invalid(string code, string message) =>
        new(code, message);
}

public sealed class InvoiceExportValidationException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
