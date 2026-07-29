using System.Security;

namespace BickersAction.Sage50Connector.Security;

public static class CredentialBootstrapper
{
    public static async Task<bool> TryHandleAsync(
        string[] args,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        if (!args.Any(arg => string.Equals(arg, "--set-credential", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Credential installation must run on Windows.");
        }

        Console.Write("Paste the one-time connector credential: ");
        using var secure = ReadSecret();
        Console.WriteLine();
        var credential = SecureStringToString(secure);
        try
        {
            await services.GetRequiredService<IMachineCredentialStore>()
                .StoreAsync(credential, cancellationToken);
            Console.WriteLine("Credential stored using Windows DPAPI machine protection.");
        }
        finally
        {
            credential = string.Empty;
        }
        return true;
    }

    private static SecureString ReadSecret()
    {
        var value = new SecureString();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) break;
            if (key.Key == ConsoleKey.Backspace)
            {
                if (value.Length > 0) value.RemoveAt(value.Length - 1);
                continue;
            }
            if (!char.IsControl(key.KeyChar)) value.AppendChar(key.KeyChar);
        }
        value.MakeReadOnly();
        return value;
    }

    private static string SecureStringToString(SecureString secure)
    {
        var pointer = IntPtr.Zero;
        try
        {
            pointer = System.Runtime.InteropServices.Marshal.SecureStringToGlobalAllocUnicode(secure);
            return System.Runtime.InteropServices.Marshal.PtrToStringUni(pointer) ?? "";
        }
        finally
        {
            if (pointer != IntPtr.Zero)
            {
                System.Runtime.InteropServices.Marshal.ZeroFreeGlobalAllocUnicode(pointer);
            }
        }
    }
}
