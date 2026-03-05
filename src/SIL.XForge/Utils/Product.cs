using System.Diagnostics;
using System.Reflection;

namespace SIL.XForge;

/// <summary>
/// Provides product-level information such as the application version.
/// </summary>
public static class Product
{
    static Product()
    {
        // Setup the product version
        string? version = null;
        string? location = Assembly.GetEntryAssembly()?.Location;
        if (!string.IsNullOrWhiteSpace(location))
        {
            version = FileVersionInfo.GetVersionInfo(location).ProductVersion;
        }

        Version = version ?? "1.0";
    }

    /// <summary>
    /// Gets the program version.
    /// </summary>
    public static string Version { get; }
}
