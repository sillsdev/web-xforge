#nullable disable warnings
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

        if (value.TrainingDataFiles.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TrainingDataFiles));
            serializer.Serialize(writer, value.TrainingDataFiles);
        }

        if (value.AvailableTrainingDataFiles is not null)
        {
            writer.WritePropertyName(nameof(value.AvailableTrainingDataFiles));
            serializer.Serialize(writer, value.AvailableTrainingDataFiles);
        }

        if (value.TrainingScriptureRanges.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TrainingScriptureRanges));
            serializer.Serialize(writer, value.TrainingScriptureRanges);
        }

        if (value.TranslationScriptureRanges.Count > 0)
        {
            writer.WritePropertyName(nameof(value.TranslationScriptureRanges));
            serializer.Serialize(writer, value.TranslationScriptureRanges);
        }

        if (value.SendEmailOnBuildFinished)
        {
            writer.WritePropertyName(nameof(value.SendEmailOnBuildFinished));
            serializer.Serialize(writer, value.SendEmailOnBuildFinished);
        }

        writer.WritePropertyName(nameof(value.ProjectId));
        serializer.Serialize(writer, value.ProjectId);

        // Handle any parameters from older versions of Scripture Forge
#pragma warning disable CS0618 // Type or member is obsolete
        if (value.UseEcho)
        {
            writer.WritePropertyName(nameof(value.DraftingEngine));
            serializer.Serialize(writer, nameof(DraftingEngine.Echo));
        }
        else if (value.FastTraining)
        {
            writer.WritePropertyName(nameof(value.DraftingEngine));
            serializer.Serialize(writer, nameof(DraftingEngine.NmtWithFastTraining));
        }
        else
        {
            writer.WritePropertyName(nameof(value.DraftingEngine));
            serializer.Serialize(writer, value.DraftingEngine.ToString());
        }
#pragma warning restore CS0618 // Type or member is obsolete

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

        // Handle any parameters from older versions of Scripture Forge
#pragma warning disable CS0618 // Type or member is obsolete
        if (buildConfig.UseEcho)
        {
            buildConfig.UseEcho = false;
            buildConfig.FastTraining = false;
            buildConfig.DraftingEngine = DraftingEngine.Echo;
        }
        else if (buildConfig.FastTraining)
        {
            buildConfig.FastTraining = false;
            buildConfig.DraftingEngine = DraftingEngine.NmtWithFastTraining;
        }
#pragma warning restore CS0618 // Type or member is obsolete

        return buildConfig;
    }
}
