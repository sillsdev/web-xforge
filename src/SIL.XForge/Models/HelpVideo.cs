namespace SIL.XForge.Models;

public class HelpVideo : IIdentifiable
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    public string Feature { get; set; }
    public string[] Keywords { get; set; }
    public string Url { get; set; }
}
