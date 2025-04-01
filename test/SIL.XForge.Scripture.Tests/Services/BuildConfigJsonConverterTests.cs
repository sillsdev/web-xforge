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
            FastTraining = true,
            UseEcho = true,
            TrainingBooks = [1, 2, 3],
            TranslationBooks = [4, 5, 6],
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.FastTraining));
        serializer.Received().Serialize(writer, buildConfig.FastTraining);
        writer.Received().WritePropertyName(nameof(buildConfig.UseEcho));
        serializer.Received().Serialize(writer, buildConfig.UseEcho);
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingBooks));
        serializer.Received().Serialize(writer, buildConfig.TrainingBooks);
        writer.Received().WritePropertyName(nameof(buildConfig.TranslationBooks));
        serializer.Received().Serialize(writer, buildConfig.TranslationBooks);
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfigWithoutFastTrainingOrEcho()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            TrainingBooks = [1, 2, 3],
            TranslationBooks = [4, 5, 6],
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.FastTraining));
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.UseEcho));
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingBooks));
        serializer.Received().Serialize(writer, buildConfig.TrainingBooks);
        writer.Received().WritePropertyName(nameof(buildConfig.TranslationBooks));
        serializer.Received().Serialize(writer, buildConfig.TranslationBooks);
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_WithoutTrainingBooksOrTranslationBooks()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { ProjectId = Project01 };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TrainingBooks));
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_WithoutTrainingBooks()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { ProjectId = Project01, TranslationBooks = [1, 2, 3] };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TrainingBooks));
        writer.Received().WritePropertyName(nameof(buildConfig.TranslationBooks));
        serializer.Received().Serialize(writer, buildConfig.TranslationBooks);
        writer.Received().WritePropertyName(nameof(buildConfig.ProjectId));
        serializer.Received().Serialize(writer, buildConfig.ProjectId);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_WithoutTranslationBooks()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { ProjectId = Project01, TrainingBooks = [1, 2, 3] };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingBooks));
        serializer.Received().Serialize(writer, buildConfig.TrainingBooks);
        writer.DidNotReceive().WritePropertyName(nameof(buildConfig.TranslationBooks));
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
    public void WriteJson_Serializes_BuildConfig_TrainingScriptureRange()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { TrainingScriptureRange = "MAT;MRK1-2,4" };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TrainingScriptureRange));
        serializer.Received().Serialize(writer, buildConfig.TrainingScriptureRange);
        writer.Received().WriteEndObject();
    }

    [Test]
    public void WriteJson_Serializes_BuildConfig_TranslationScriptureRange()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig { TranslationScriptureRange = "JHN" };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
        writer.Received().WritePropertyName(nameof(buildConfig.TranslationScriptureRange));
        serializer.Received().Serialize(writer, buildConfig.TranslationScriptureRange);
        writer.Received().WriteEndObject();
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
    public void ReadJson_Deserializes_JSON_Object()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TrainingBooks)}}":[1,2,3],
            "{{nameof(BuildConfig.TranslationBooks)}}":[4,5,6],
            "{{nameof(BuildConfig.FastTraining)}}":true,
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
        Assert.IsTrue(buildConfig!.FastTraining);
        Assert.IsTrue(buildConfig.UseEcho);
        CollectionAssert.AreEqual(new List<int> { 1, 2, 3 }, buildConfig.TrainingBooks);
        CollectionAssert.AreEqual(new List<int> { 4, 5, 6 }, buildConfig.TranslationBooks);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_WithoutFastTrainingOrEchoConfig()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TrainingBooks)}}":[1,2,3],
            "{{nameof(BuildConfig.TranslationBooks)}}":[4,5,6]
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
        CollectionAssert.AreEqual(new List<int> { 1, 2, 3 }, buildConfig.TrainingBooks);
        CollectionAssert.AreEqual(new List<int> { 4, 5, 6 }, buildConfig.TranslationBooks);
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
        Assert.IsFalse(buildConfig!.FastTraining);
        Assert.IsFalse(buildConfig.UseEcho);
        CollectionAssert.AreEqual(new List<string> { Data01, Data02 }, buildConfig.TrainingDataFiles);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_TrainingScriptureRange()
    {
        var converter = new BuildConfigJsonConverter();
        const string scriptureRange = "MAT;MRK1-2,4";
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TrainingScriptureRange)}}":"{{scriptureRange}}"
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
        Assert.AreEqual(scriptureRange, buildConfig.TrainingScriptureRange);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object_TranslationScriptureRange()
    {
        var converter = new BuildConfigJsonConverter();
        const string scriptureRange = "JHN";
        const string jsonString = $$"""
            {
            "{{nameof(BuildConfig.ProjectId)}}":"{{Project01}}",
            "{{nameof(BuildConfig.TranslationScriptureRange)}}":"{{scriptureRange}}"
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
        Assert.AreEqual(scriptureRange, buildConfig.TranslationScriptureRange);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
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
        Assert.IsFalse(buildConfig!.FastTraining);
        Assert.IsFalse(buildConfig.UseEcho);
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
        Assert.IsFalse(buildConfig!.FastTraining);
        Assert.IsFalse(buildConfig.UseEcho);
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
