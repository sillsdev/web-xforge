using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
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
                    o.ProjectDoc = new DocConfig("sf_projects", typeof(SFProject));
                    o.ProjectDataDocs.AddRange(new[]
                    {
                        new DocConfig("sf_project_user_configs", typeof(SFProjectUserConfig)),
                        new DocConfig("texts", typeof(TextData), OTType.RichText),
                        new DocConfig("questions", typeof(QuestionList)),
                        new DocConfig("comments", typeof(CommentList))
                    });
                }, launchWithDebugging);
            return services;
        }
    }
}
