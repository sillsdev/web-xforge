using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// This class is used to add the SF real-time server to the DI container.
/// </summary>
public static class SFRealtimeServiceCollectionExtensions
{
    public static IServiceCollection AddSFRealtimeServer(
        this IServiceCollection services,
        ILoggerFactory loggerFactory,
        IConfiguration configuration,
        string? nodeOptions = null
    )
    {
        var realtimeOptions = configuration.GetOptions<RealtimeOptions>();
        services.AddRealtimeServer(
            loggerFactory,
            configuration,
            o =>
            {
                o.AppModuleName = "scriptureforge";
                o.MigrationsDisabled = realtimeOptions.MigrationsDisabled;
                o.UseExistingRealtimeServer = realtimeOptions.UseExistingRealtimeServer;
                o.ProjectDoc = new DocConfig("sf_projects", typeof(SFProject));
                o.ProjectDataDocs.AddRange(
                    [
                        new DocConfig("sf_project_user_configs", typeof(SFProjectUserConfig)),
                        new DocConfig("texts", typeof(TextData), OTType.RichText),
                        new DocConfig("questions", typeof(Question)),
                        new DocConfig("note_threads", typeof(NoteThread)),
                        new DocConfig("text_audio", typeof(TextAudio)),
                        new DocConfig("biblical_terms", typeof(BiblicalTerm)),
                        new DocConfig("training_data", typeof(TrainingData)),
                        new DocConfig("text_documents", typeof(TextDocument)),
                    ]
                );
                o.UserDataDocs.AddRange([new DocConfig("sf_project_user_configs", typeof(SFProjectUserConfig))]);
            },
            nodeOptions,
            realtimeOptions.UseExistingRealtimeServer
        );
        return services;
    }
}
