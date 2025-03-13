using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public class DraftSourcesArrays
{
    public TranslateSource[] DraftingSources { get; set; }
    public TranslateSource[] TrainingSources { get; set; }
    public SFProject[] TrainingTargets { get; set; }

    internal static DraftSourcesArrays ToDraftSourcesArrays(SFProject project)
    {
        List<TranslateSource> trainingSources = [];
        List<TranslateSource> draftingSources = [];
        SFProject[] trainingTargets = [project];
        DraftConfig draftConfig = project.TranslateConfig.DraftConfig;

        TranslateSource trainingSource;
        if (draftConfig.AlternateTrainingSourceEnabled && draftConfig.AlternateTrainingSource != null)
        {
            trainingSource = draftConfig.AlternateTrainingSource;
        }
        else
        {
            trainingSource = project.TranslateConfig.Source;
        }
        if (trainingSource != null)
        {
            trainingSources.Add(trainingSource);
        }
        if (draftConfig.AdditionalTrainingSourceEnabled && draftConfig.AdditionalTrainingSource != null)
        {
            trainingSources.Add(draftConfig.AdditionalTrainingSource);
        }

        TranslateSource draftingSource;
        if (draftConfig.AlternateSourceEnabled && draftConfig.AlternateSource != null)
        {
            draftingSource = draftConfig.AlternateSource;
        }
        else
        {
            draftingSource = project.TranslateConfig.Source;
        }
        if (draftingSource != null)
        {
            draftingSources.Add(draftingSource);
        }

        return new DraftSourcesArrays
        {
            DraftingSources = [.. draftingSources],
            TrainingSources = [.. trainingSources],
            TrainingTargets = trainingTargets,
        };
    }
}
