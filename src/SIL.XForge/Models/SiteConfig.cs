namespace SIL.XForge.Models;

public class SiteConfig : IIdentifiable
{
    public required string Id { get; set; }
    public required string Name { get; set; }
    public string? LastFinishedBuildId { get; set; }
}
