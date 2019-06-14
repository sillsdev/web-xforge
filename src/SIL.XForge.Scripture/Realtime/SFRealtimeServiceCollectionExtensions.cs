using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.DataAccess;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFRealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddSFRealtimeServer(this IServiceCollection services,
            bool launchWithDebugging = false)
        {
            services.AddRealtimeServer(o =>
                {
                    o.ProjectRoles = SFProjectRoles.Instance;
                    o.ProjectsCollectionName = SFDataAccessConstants.ProjectsCollectionName;
                    o.Collections = new[]
                    {
                        new RealtimeCollectionConfig(SFDataAccessConstants.TextDataCollectionName,
                            SFDataAccessConstants.TextsCollectionName, OTType.RichText)
                        {
                            Types = { new RealtimeType(SFDomain.Texts) }
                        },
                        new RealtimeCollectionConfig(SFDataAccessConstants.QuestionDataCollectionName,
                            SFDataAccessConstants.TextsCollectionName, OTType.Json0)
                        {
                            Types =
                            {
                                new RealtimeType(SFDomain.Questions) { Path = { "$" } },
                                new RealtimeType(SFDomain.Answers) { Path = { "$", "answers", "$" }},
                                new RealtimeType(SFDomain.Likes) { Path = { "$", "answers", "$", "likes", "$" } }
                            }
                        },
                        new RealtimeCollectionConfig(SFDataAccessConstants.CommentDataCollectionName,
                            SFDataAccessConstants.TextsCollectionName, OTType.Json0)
                        {
                            Types = { new RealtimeType(SFDomain.Comments) { Path = { "$" } } }
                        }
                    };
                }, launchWithDebugging);
            return services;
        }
    }
}
