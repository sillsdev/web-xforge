using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    /// <summary>
    /// This class is used to add the SF real-time server to the DI container.
    /// </summary>
    public static class SFRealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddSFRealtimeServer(this IServiceCollection services,
            IConfiguration configuration, bool launchWithDebugging = false)
        {
            services.AddRealtimeServer(configuration, o =>
                {
                    o.AppModuleName = "scriptureforge";
                    o.Docs.AddRange(new[]
                    {
                        new DocConfig(RootDataTypes.Projects, typeof(SFProject)),
                        new DocConfig(SFRootDataTypes.ProjectUserConfigs, typeof(SFProjectUserConfig)),
                        new DocConfig(SFRootDataTypes.Texts, typeof(TextData), OTType.RichText),
                        new DocConfig(SFRootDataTypes.Questions, typeof(QuestionList)),
                        new DocConfig(SFRootDataTypes.Comments, typeof(CommentList))
                    });
                }, launchWithDebugging);
            return services;
        }
    }
}
