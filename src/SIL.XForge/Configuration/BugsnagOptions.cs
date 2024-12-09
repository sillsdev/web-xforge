namespace SIL.XForge.Configuration;

public class BugsnagOptions
{
    public string ApiKey { get; init; } = string.Empty;
    public string[] NotifyReleaseStages { get; init; } = [];
    public string ReleaseStage { get; init; } = string.Empty;
}
