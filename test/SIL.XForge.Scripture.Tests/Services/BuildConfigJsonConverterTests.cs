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

    [Test]
    public void WriteJson_Serializes_BuildConfig()
    {
        var converter = new BuildConfigJsonConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();
        var buildConfig = new BuildConfig
        {
            TrainingBooks = new HashSet<int> { 1, 2, 3 },
            TranslationBooks = new HashSet<int> { 4, 5, 6 },
            ProjectId = Project01,
        };

        // SUT
        converter.WriteJson(writer, buildConfig, serializer);

        writer.Received().WriteStartObject();
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
        var buildConfig = new BuildConfig { ProjectId = Project01, };

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
        var buildConfig = new BuildConfig
        {
            ProjectId = Project01,
            TranslationBooks = new HashSet<int> { 1, 2, 3 }
        };

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
        var buildConfig = new BuildConfig
        {
            ProjectId = Project01,
            TrainingBooks = new HashSet<int> { 1, 2, 3 }
        };

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
        Assert.AreEqual(Project01, result.ProjectId);
    }

    [Test]
    public void ReadJson_Deserializes_JSON_Object()
    {
        var converter = new BuildConfigJsonConverter();
        const string jsonString =
            $"{{\"{nameof(BuildConfig.ProjectId)}\":\"{Project01}\",\"{nameof(BuildConfig.TrainingBooks)}\":[1,2,3],\"{nameof(BuildConfig.TranslationBooks)}\":[4,5,6]}}";
        using var stringReader = new StringReader(jsonString);
        using var reader = new JsonTextReader(stringReader);
        var serializer = new JsonSerializer();

        // SUT
        var buildConfig = converter.ReadJson(reader, typeof(BuildConfig), null, false, serializer);

        Assert.IsNotNull(buildConfig);
        Assert.IsInstanceOf<BuildConfig>(buildConfig);
        CollectionAssert.AreEqual(new List<int> { 1, 2, 3 }, buildConfig.TrainingBooks);
        CollectionAssert.AreEqual(new List<int> { 4, 5, 6 }, buildConfig.TranslationBooks);
        Assert.AreEqual(Project01, buildConfig.ProjectId);
    }
}
