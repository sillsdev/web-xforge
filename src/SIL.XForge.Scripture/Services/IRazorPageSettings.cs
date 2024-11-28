namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Various settings and values to be used in the Razor pages.
/// </summary>
public interface IRazorPageSettings
{
    /// <summary>
    /// Gets the Bugsnag configuration as a JSON string.
    /// </summary>
    /// <returns>A JSON string representing the Bugsnag configuration.</returns>
    string GetBugsnagConfig();

    /// <summary>
    /// Gets the product version number as a string.
    /// </summary>
    /// <returns>The version number.</returns>
    string GetProductVersion();

    /// <summary>
    /// Gets the site name.
    /// </summary>
    /// <returns>The website name.</returns>
    /// <remarks>
    /// This value will depend on the value of <seealso cref="UseScriptureForgeBranding"/>.
    /// </remarks>
    string GetSiteName();

    /// <summary>
    /// Gets whether we should use Scripture Forge branding or not.
    /// </summary>
    /// <returns>
    /// <c>true</c> if we are to use Scripture Forge branding; otherwise, <c>false</c>.
    /// </returns>
    bool UseScriptureForgeBranding();
}
