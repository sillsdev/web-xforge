using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class BuildConfigJsonConverterTests
{
    private const string Project01 = "project01";
    private const string Data01 = "data01";
    private const string Data02 = "data02";

    [Test]
    public void WriteJson_Serializes_BuildConfig()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            SendEmailOnBuildFinished = true,
            DraftingEngine = DraftingEngine.NmtWithLlmPostProcessing,
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.SendEmailOnBuildFinished));
        serializer.Received().Serialize(writer, buildConfig.SendEmailOnBuildFinished);
        writer.Received().WritePropertyName(nameof(buildConfig.DraftingEngine));
        serializer.Received().Serialize(writer, nameof(DraftingEngine.NmtWithLlmPostProcessing));
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    [Obsolete]
    public void WriteJson_Serializes_BuildConfigWithEcho()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            SendEmailOnBuildFinished = true,
            UseEcho = true,
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.SendEmailOnBuildFinished));
        serializer.Received().Serialize(writer, buildConfig.SendEmailOnBuildFinished);
        writer.Received().WritePropertyName(nameof(buildConfig.DraftingEngine));
        serializer.Received().Serialize(writer, nameof(DraftingEngine.Echo));
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    [Obsolete]
    public void WriteJson_Serializes_BuildConfigWithFastTraining()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            FastTraining = true,
            SendEmailOnBuildFinished = true,
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.SendEmailOnBuildFinished));
        serializer.Received().Serialize(writer, buildConfig.SendEmailOnBuildFinished);
        writer.Received().WritePropertyName(nameof(buildConfig.DraftingEngine));
        serializer.Received().Serialize(writer, nameof(DraftingEngine.NmtWithFastTraining));
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfigWithoutDefaultValues()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { ProjectId = Project01 };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.AvailableTrainingDataFiles));
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TrainingDataFiles));
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TrainingScriptureRanges));
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TranslationScriptureRanges));
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.SendEmailOnBuildFinished));
        writer.Received().WritePropertyName(nameof(buildConfig.DraftingEngine));
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_TrainingDataFiles()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { TrainingDataFiles = [Data01, Data02] };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingDataFiles));
        serializer.Received().Serialize(writer, buildConfig.TrainingDataFiles);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_AvailableTrainingDataFiles()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { AvailableTrainingDataFiles = [Data01, Data02] };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.AvailableTrainingDataFiles));
        serializer.Received().Serialize(writer, buildConfig.AvailableTrainingDataFiles);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_OmitsAvailableTrainingDataFiles_WhenNull()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { ProjectId = Project01 };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.AvailableTrainingDataFiles));
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_TrainingScriptureRanges()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            TrainingScriptureRanges = [new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = "MAT;MRK" }],
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingScriptureRanges));
        serializer.Received().Serialize(writer, buildConfig.TrainingScriptureRanges);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_TranslationScriptureRanges()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            TranslationScriptureRanges =
            [
                new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = "MAT;MRK" },
            ],
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TranslationScriptureRanges));
        serializer.Received().Serialize(writer, buildConfig.TranslationScriptureRanges);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_Null_BuildConfig()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = new JsonSerializer();

        // SUT
        converter.WriteJson(writer, value: null, serializer);

        writer.Received(1).WriteNull();
    }

    [Test]
    public void ReadJson_Deserializes_JSON_String()
    {
        var converter = new BuildConfigJsonConverter();
        var reader = Substitute.For<JsonReader>();
        var serializer = new JsonSerializer();
        reader.TokenType.Returns(JsonToken.String);
        reader.Value.Returns(Project01);

        // SUT
        var result = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(result);
        Assert.IsInstanceOf<BuildConfig>(result);
        Assert.AreEqual(Project01, result!.ProjectId);
    }

    [Test]
    [Obsolete]
    public void ReadJson_Deserializes_Legacy_FastTraining()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.FastTraining)}}":true,
            "{{nameof(BuildConfig.SendEmailOnBuildFinished)}}":true
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.FastTraining);
        Assert.IsTrue(buildConfig.SendEmailOnBuildFinished);
        Assert.AreEqual(DraftingEngine.NmtWithFastTraining, buildConfig.DraftingEngine);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    [Obsolete]
    public void ReadJson_Deserializes_Legacy_UseEcho()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.UseEcho)}}":true
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.FastTraining);
        Assert.IsFalse(buildConfig.UseEcho);
        Assert.AreEqual(DraftingEngine.Echo, buildConfig.DraftingEngine);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_WithoutDefaultValues()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.SendEmailOnBuildFinished);
        Assert.AreEqual(DraftingEngine.Nmt, buildConfig.DraftingEngine);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_TrainingDataFiles()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TrainingDataFiles)}}":["{{Data01}}","{{Data02}}"]
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.SendEmailOnBuildFinished);
        CollectionAssert.AreEqual(new List<string> { Data01, Data02 }, buildConfig.TrainingDataFiles);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_AvailableTrainingDataFiles()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.AvailableTrainingDataFiles)}}":["{{Data01}}","{{Data02}}"]
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsNotNull(buildConfig!.AvailableTrainingDataFiles);
        CollectionAssert.AreEqual(new List<string> { Data01, Data02 }, buildConfig.AvailableTrainingDataFiles!);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_LeavesAvailableTrainingDataFilesNull_WhenAbsent()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}"
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsNull(buildConfig!.AvailableTrainingDataFiles);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_TrainingScriptureRanges()
    {
        var converter = new BuildConfigJsonConverter();
        const string scriptureRange = "JHN";
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TrainingScriptureRanges)}}":
            [
                {
                "{{nameof(ProjectScriptureRange.ProjectId)}}":"{{Project01}}",
                "{{nameof(ProjectScriptureRange.ScriptureRange)}}":"{{scriptureRange}}"
                }
            ]
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.SendEmailOnBuildFinished);
        CollectionAssert.AreEqual(
            new List<ProjectScriptureRange>
            {
                new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = scriptureRange },
            },
            buildConfig.TrainingScriptureRanges
        );
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_TranslationScriptureRanges()
    {
        var converter = new BuildConfigJsonConverter();
        const string scriptureRange = "JHN";
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TranslationScriptureRanges)}}":
            [
                {
                "{{nameof(ProjectScriptureRange.ProjectId)}}":"{{Project01}}",
                "{{nameof(ProjectScriptureRange.ScriptureRange)}}":"{{scriptureRange}}"
                }
            ]
            }
            """;
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        Assert.IsFalse(buildConfig!.SendEmailOnBuildFinished);
        CollectionAssert.AreEqual(
            new List<ProjectScriptureRange>
            {
                new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = scriptureRange },
            },
            buildConfig.TranslationScriptureRanges
        );
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }
}
