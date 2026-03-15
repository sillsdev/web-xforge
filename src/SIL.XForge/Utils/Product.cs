using System;
using System.Diagnostics;
using System.IO;
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

    public static string prodContainerRtsModulePath = Path.Join("/app", "lib", "cjs", "common", "index.js");

    /// <summary>
    /// If running in the src/SIL.XForge.Scripture/Dockerfile container, which relies on a separate RealtimeServer
    /// container.
    /// </summary>
    public static bool RunningInProdContainer
    {
        get
        {
            bool moduleExists = File.Exists(prodContainerRtsModulePath);
            bool runningInContainer =
                Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER")?.ToUpperInvariant() == "TRUE";
            return runningInContainer && moduleExists;
        }
    }

    /// <summary>
    /// If running in a .devcontainer/Dockerfile container, which has RealtimeServer and dotnet in the same container.
    /// </summary>
    public static bool RunningInDevContainer
    {
        get
        {
            bool moduleExists = File.Exists(prodContainerRtsModulePath);
            bool runningInContainer =
                Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER")?.ToUpperInvariant() == "TRUE";
            return runningInContainer && moduleExists;
        }
    }

    /// <summary>
    /// Gets the program version.
    /// </summary>
    public static string Version { get; }
}
