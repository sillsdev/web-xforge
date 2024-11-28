namespace SIL.XForge.Configuration;

public class BugsnagOptions
{
    public string ApiKey { get; set; }
    public string[] NotifyReleaseStages { get; set; }
    public string ReleaseStage { get; set; }
}
