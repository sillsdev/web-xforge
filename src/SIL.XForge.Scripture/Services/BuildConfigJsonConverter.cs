using System;
using Newtonsoft.Json;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides backwards compatible JSON Conversion for
/// <see cref="Controllers.MachineApiController.StartPreTranslationBuildAsync"/>
/// </summary>
/// <remarks>
/// This converter either accepts a JSON string or a JSON object matching <see cref="BuildConfig"/>.
/// </remarks>
public class BuildConfigJsonConverter : JsonConverter<BuildConfig>
{
    /// <inheritdoc />
    public override void WriteJson(JsonWriter writer, BuildConfig? value, JsonSerializer serializer)
    {
        if (value is null)
        {
            writer.WriteNull();
            return;
        }

        writer.WriteStartObject();

        if (value.TrainingBooks.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TrainingBooks));
            serializer.Serialize(writer, value.TrainingBooks);
        }

        if (value.TrainingDataFiles.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TrainingDataFiles));
            serializer.Serialize(writer, value.TrainingDataFiles);
        }

        if (!string.IsNullOrWhiteSpace(value.TrainingScriptureRange))
        {
            writer.WritePropertyName(nameof(value.TrainingScriptureRange));
            serializer.Serialize(writer, value.TrainingScriptureRange);
        }

        if (value.TrainingScriptureRanges.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TrainingScriptureRanges));
            serializer.Serialize(writer, value.TrainingScriptureRanges);
        }

        if (value.TranslationBooks.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TranslationBooks));
            serializer.Serialize(writer, value.TranslationBooks);
        }

        if (!string.IsNullOrWhiteSpace(value.TranslationScriptureRange))
        {
            writer.WritePropertyName(nameof(value.TranslationScriptureRange));
            serializer.Serialize(writer, value.TranslationScriptureRange);
        }

        if (value.TranslationScriptureRanges.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TranslationScriptureRanges));
            serializer.Serialize(writer, value.TranslationScriptureRanges);
        }

        if (value.FastTraining)
        {
            writer.WritePropertyName(nameof(value.FastTraining));
            serializer.Serialize(writer, value.FastTraining);
        }

        writer.WritePropertyName(nameof(value.ProjectId));
        serializer.Serialize(writer, value.ProjectId);

        writer.WriteEndObject();
    }

    /// <inheritdoc />
    public override BuildConfig? ReadJson(
        JsonReader reader,
        Type objectType,
        BuildConfig? existingValue,
        bool hasExistingValue,
        JsonSerializer serializer
    )
    {
        // If we were just passed a json string, this will be the project id
        if (reader.TokenType == JsonToken.String)
        {
            return new BuildConfig { ProjectId = serializer.Deserialize<string>(reader) };
        }

        // We were passed a complete object, so serialize it completely
        BuildConfig buildConfig = new BuildConfig();
        serializer.Populate(reader, buildConfig);
        return buildConfig;
    }
}
