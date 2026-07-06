namespace SIL.XForge.Models;

/// <summary>
/// The sitewide configuration stored in MongoDB.
/// </summary>
public class SiteConfig : IIdentifiable
{
    /// <summary>
    /// The object identifier.
    /// </summary>
    public required string Id { get; set; }

    /// <summary>
    /// The site name.
    /// </summary>
    /// <remarks>
    /// This corresponds to <see cref="Configuration.SiteOptions.Id"/>.
    /// </remarks>
    public required string Name { get; set; }

    /// <summary>
    /// The last finished build identifier.
    /// </summary>
    /// <remarks>
    /// This is used by the Machine Background Service.
    /// </remarks>
    public string? LastFinishedBuildId { get; set; }

    /// <summary>
    /// The number of builds allowed per day for every project.
    /// </summary>
    public int BuildQuotaPerDay { get; set; }

    /// <summary>
    /// The number of builds allowed per week for every project.
    /// </summary>
    public int BuildQuotaPerWeek { get; set; }

    /// <summary>
    /// The number of builds allowed per month for every project.
    /// </summary>
    public int BuildQuotaPerMonth { get; set; }
}
