using System.Linq;
using NUnit.Framework;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

struct ProjectSourceArgs
{
    public string? Source { get; set; }
    public bool? AlternateSourceEnabled { get; set; }
    public string? AlternateSource { get; set; }
    public bool? AlternateTrainingSourceEnabled { get; set; }
    public string? AlternateTrainingSource { get; set; }
    public bool? AdditionalTrainingSourceEnabled { get; set; }
    public string? AdditionalTrainingSource { get; set; }
}

[TestFixture]
public class DraftSourcesArraysTests
{
    [Test]
    public void ProjectToDraftSources_DefaultProject()
    {
        ProjectSourceArgs args = new() { };
        SFProject project = GetProject(args);

        //SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(0, draftSources.DraftingSources.Length);
        Assert.AreEqual(0, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        Assert.AreEqual(project.ParatextId, target.ParatextId);
    }

    [Test]
    public void ProjectToDraftSources_RegularSourceInProject()
    {
        ProjectSourceArgs args = new() { Source = "Source" };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.Single();
        Assert.AreEqual(trainingSource.ShortName, "Source");
    }

    [Test]
    public void ProjectToDraftSources_SpecificTrainingSource()
    {
        ProjectSourceArgs args = new() { Source = "Source", AlternateTrainingSource = "Training" };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.Single();
        Assert.AreEqual(trainingSource.ShortName, "Training");
    }

    [Test]
    public void ProjectToDraftSources_SpecificDraftingSource()
    {
        ProjectSourceArgs args = new() { Source = "Source", AlternateSource = "Drafting" };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Drafting");
        TranslateSource trainingSource = draftSources.TrainingSources.Single();
        Assert.AreEqual(trainingSource.ShortName, "Source");
    }

    [Test]
    public void ProjectToDraftSources_SpecificAdditionalTrainingSource()
    {
        ProjectSourceArgs args = new() { Source = "Source", AdditionalTrainingSource = "Training2" };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(2, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.First();
        Assert.AreEqual(trainingSource.ShortName, "Source");
        TranslateSource additionalTrainingSource = draftSources.TrainingSources[1];
        Assert.AreEqual(additionalTrainingSource.ShortName, "Training2");
    }

    [Test]
    public void ProjectToDraftSources_SpecificTwoTrainingSource()
    {
        ProjectSourceArgs args = new()
        {
            Source = "Source",
            AlternateTrainingSource = "Training1",
            AdditionalTrainingSource = "Training2",
        };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(2, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.First();
        Assert.AreEqual(trainingSource.ShortName, "Training1");
        TranslateSource additionalTrainingSource = draftSources.TrainingSources[1];
        Assert.AreEqual(additionalTrainingSource.ShortName, "Training2");
    }

    [Test]
    public void ProjectToDraftSources_AllSpecificSources()
    {
        ProjectSourceArgs args = new()
        {
            Source = "Source",
            AlternateSource = "Drafting",
            AlternateTrainingSource = "Training1",
            AdditionalTrainingSource = "Training2",
        };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(2, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Drafting");
        TranslateSource trainingSource = draftSources.TrainingSources.First();
        Assert.AreEqual(trainingSource.ShortName, "Training1");
        TranslateSource additionalTrainingSource = draftSources.TrainingSources[1];
        Assert.AreEqual(additionalTrainingSource.ShortName, "Training2");
    }

    [Test]
    public void ProjectToDraftSources_AllSpecificSourceDisabled()
    {
        ProjectSourceArgs args = new()
        {
            Source = "Source",
            AlternateSourceEnabled = false,
            AlternateSource = "Drafting",
            AlternateTrainingSourceEnabled = false,
            AlternateTrainingSource = "Training1",
            AdditionalTrainingSourceEnabled = false,
            AdditionalTrainingSource = "Training2",
        };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.Single();
        Assert.AreEqual(trainingSource.ShortName, "Source");
    }

    [Test]
    public void ProjectToDraftSources_AllSpecificSourceEnabledButUndefined()
    {
        ProjectSourceArgs args = new() { Source = "Source" };
        SFProject project = GetProject(args);

        // SUT
        DraftSourcesArrays draftSources = DraftSourcesArrays.ProjectToDraftSources(project);
        Assert.IsNotNull(draftSources);
        Assert.AreEqual(1, draftSources.DraftingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingSources.Length);
        Assert.AreEqual(1, draftSources.TrainingTargets.Length);

        SFProject target = draftSources.TrainingTargets.Single();
        Assert.AreEqual(project.Name, target.Name);
        TranslateSource draftingSource = draftSources.DraftingSources.Single();
        Assert.AreEqual(draftingSource.ShortName, "Source");
        TranslateSource trainingSource = draftSources.TrainingSources.Single();
        Assert.AreEqual(trainingSource.ShortName, "Source");
    }

    SFProject GetProject(ProjectSourceArgs args)
    {
        var project = new SFProject
        {
            Name = "Project 01",
            ParatextId = "PT01",
            IsRightToLeft = false,
            ShortName = "P01",
            WritingSystem = new WritingSystem { Tag = "pt" },
            TranslateConfig = new TranslateConfig
            {
                DraftConfig = new DraftConfig
                {
                    AlternateSourceEnabled = args.AlternateSourceEnabled ?? true,
                    AlternateSource = GetTranslateSource(args.AlternateSource),

                    AlternateTrainingSourceEnabled = args.AlternateTrainingSourceEnabled ?? true,
                    AlternateTrainingSource = GetTranslateSource(args.AlternateTrainingSource),

                    AdditionalTrainingSourceEnabled = args.AdditionalTrainingSourceEnabled ?? true,
                    AdditionalTrainingSource = GetTranslateSource(args.AdditionalTrainingSource),
                },
                Source = GetTranslateSource(args.Source),
            },
        };
        return project;
    }

    static TranslateSource GetTranslateSource(string? name)
    {
        if (name == null)
        {
            return null;
        }
        return new TranslateSource
        {
            Name = $"{name} Project",
            ProjectRef = $"ref{name}",
            ShortName = name,
            WritingSystem = new WritingSystem { Tag = "pr" },
            IsRightToLeft = false,
        };
    }
}
