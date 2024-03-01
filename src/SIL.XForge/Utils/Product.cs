using System.Diagnostics;
using System.Reflection;

namespace SIL.XForge;

public static class Product
{
    static Product()
    {
        // Setup the product version
        string? version = null;
        string? location = Assembly.GetEntryAssembly()?.Location;
        if (!string.IsNullOrWhiteSpace(location))
        {
            version = FileVersionInfo.GetVersionInfo(location).ProductVersion?.Split('+')[0];
        }

        Version = version ?? "1.0";
    }

    /// <summary>
    /// Gets the program version.
    /// </summary>
    public static string Version { get; }
}
