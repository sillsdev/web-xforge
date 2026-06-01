using System;

namespace SIL.XForge.Configuration;

public class SiteOptions
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string SmtpServer { get; set; } = string.Empty;
    public string PortNumber { get; set; } = string.Empty;
    public string EmailFromAddress { get; set; } = string.Empty;
    public bool SendEmail { get; set; }
    public string IssuesEmail { get; set; } = string.Empty;
    public string SiteDir { get; set; } = string.Empty;
    public string SharedDir { get; set; } = string.Empty;
    public Uri WebsiteUrl => new Uri(Origin.Split(';')[0], UriKind.Absolute);
}
