namespace SIL.XForge.Scripture.Models;

public record DraftSourceConfiguration
{
    public string[] DraftingSourcesParatextIds { get; init; } = [];
    public string[] TrainingSourcesParatextIds { get; init; } = [];
    public string[] SelectedTrainingDataFiles { get; init; } = [];
}
