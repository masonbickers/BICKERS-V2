using System.Security;

namespace BickersAction.Sage50Connector.Security;

public static class CredentialBootstrapper
{
    public static async Task<bool> TryHandleAsync(
        string[] args,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var setConnector = HasArgument(args, "--set-credential");
        var setReadOnly = HasArgument(args, "--set-sage-read-credential");
        var setInvoiceWrite = HasArgument(args, "--set-sage-write-credential");
        if (!setConnector && !setReadOnly && !setInvoiceWrite)
        {
            return false;
        }
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Credential installation must run on Windows.");
        }

        if (setConnector)
        {
            Console.Write("Paste the one-time connector credential: ");
            var credential = ReadSecretAsString();
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
        }

        if (setReadOnly)
        {
            await StoreSageCredentialAsync(
                services,
                SageCredentialPurpose.ReadOnly,
                "read-only",
                cancellationToken);
        }
        if (setInvoiceWrite)
        {
            await StoreSageCredentialAsync(
                services,
                SageCredentialPurpose.InvoiceWrite,
                "invoice-write",
                cancellationToken);
        }
        return true;
    }

    private static bool HasArgument(string[] args, string expected) =>
        args.Any(arg => string.Equals(arg, expected, StringComparison.OrdinalIgnoreCase));

    private static async Task StoreSageCredentialAsync(
        IServiceProvider services,
        SageCredentialPurpose purpose,
        string label,
        CancellationToken cancellationToken)
    {
        Console.Write($"Enter the dedicated Sage {label} username: ");
        var username = Console.ReadLine() ?? "";
        Console.Write($"Enter the dedicated Sage {label} password: ");
        var password = ReadSecretAsString();
        try
        {
            await services.GetRequiredService<ISageCompanyCredentialStore>()
                .StoreAsync(purpose, username, password, cancellationToken);
            Console.WriteLine($"Sage {label} credential stored using Windows DPAPI machine protection.");
        }
        finally
        {
            password = string.Empty;
        }
    }

    private static string ReadSecretAsString()
    {
        using var secure = ReadSecret();
        Console.WriteLine();
        return SecureStringToString(secure);
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
