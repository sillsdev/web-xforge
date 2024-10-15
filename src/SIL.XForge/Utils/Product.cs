using System;
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
            version = FileVersionInfo.GetVersionInfo(location).ProductVersion;
        }

        Version = version ?? "1.0";
    }

    public static bool RunningInContainer =>
        Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER")?.ToUpperInvariant() == "TRUE";

    /// <summary>
    /// Gets the program version.
    /// </summary>
    public static string Version { get; }
}
