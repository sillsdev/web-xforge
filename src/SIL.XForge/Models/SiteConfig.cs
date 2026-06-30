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
    /// The number of builds allowed per quota period.
    /// </summary>
    public int BuildQuotaLimit { get; set; }

    /// <summary>
    /// The quota period.
    /// </summary>
    /// <remarks>
    ///The <see cref="BuildQuotaPeriodUnit"/> will be multiplied by this number
    /// to get total number of hours in the quota period.
    /// </remarks>
    public int BuildQuotaPeriod { get; set; }

    /// <summary>
    /// The quota period unit, stored as a number of hours corresponding to hour, day, week, month, and year.
    /// </summary>
    public QuotaPeriod BuildQuotaPeriodUnit { get; set; }
}

/// <summary>
/// The quota period in hours.
/// </summary>
/// <remarks>
/// This value is stored as a number of hours.
/// </remarks>
public enum QuotaPeriod
{
    None = 0,
    Hour = 1,
    Day = 24,
    Week = 24 * 7,
    Month = 24 * 30,
    Year = 24 * 365,
}
