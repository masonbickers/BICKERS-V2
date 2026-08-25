namespace BickersAction.Sage50Connector.Sage;

// Version adapters must marshal every SDO/COM operation through this executor.
// Calls are serialised because Sage company sessions are not treated as thread-safe.
public static class SageStaExecutor
{
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public static async Task<T> RunAsync<T>(
        Func<T> operation,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Sage SDO operations require Windows.");
        }
        ArgumentNullException.ThrowIfNull(operation);
        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout));
        }

        await Gate.WaitAsync(cancellationToken);
        var completion = new TaskCompletionSource<T>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try
            {
                completion.TrySetResult(operation());
            }
            catch (Exception error)
            {
                completion.TrySetException(error);
            }
        })
        {
            IsBackground = true,
            Name = "Bickers Sage SDO STA"
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();

        try
        {
            return await completion.Task.WaitAsync(timeout, cancellationToken);
        }
        catch (TimeoutException)
        {
            throw new TimeoutException("The Sage SDO operation exceeded its approved timeout.");
        }
        finally
        {
            if (completion.Task.IsCompleted)
            {
                Gate.Release();
            }
            else
            {
                _ = completion.Task.ContinueWith(
                    task =>
                    {
                        _ = task.Exception;
                        Gate.Release();
                    },
                    CancellationToken.None,
                    TaskContinuationOptions.ExecuteSynchronously,
                    TaskScheduler.Default);
            }
        }
    }
}
