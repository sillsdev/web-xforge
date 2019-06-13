using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
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
                    o.Docs = new[]
                    {
                        new RealtimeDocConfig(RootDataTypes.Projects, OTType.Json0),
                        new RealtimeDocConfig(SFRootDataTypes.Texts, OTType.RichText)
                        {
                            Models = { new RealtimeModelConfig(SFDomain.Texts) }
                        },
                        new RealtimeDocConfig(SFRootDataTypes.Questions, OTType.Json0)
                        {
                            Models =
                            {
                                new RealtimeModelConfig(SFDomain.Questions) { Path = { "$" } },
                                new RealtimeModelConfig(SFDomain.Answers)
                                {
                                    Path = { "$", nameof(Question.Answers), "$" }
                                },
                                new RealtimeModelConfig(SFDomain.Likes)
                                {
                                    Path = { "$", nameof(Question.Answers), "$", nameof(Answer.Likes), "$" }
                                }
                            }
                        },
                        new RealtimeDocConfig(SFRootDataTypes.Comments, OTType.Json0)
                        {
                            Models = { new RealtimeModelConfig(SFDomain.Comments) { Path = { "$" } } }
                        }
                    };
                }, launchWithDebugging);
            return services;
        }
    }
}
