using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFRealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddSFRealtimeServer(this IServiceCollection services,
            IConfiguration configuration, bool launchWithDebugging = false)
        {
            services.AddRealtimeServer(configuration, o =>
                {
                    o.ProjectDoc.ImmutableProperties.AddRange(new[]
                    {
                        PathTemplateConfig<SFProject>.Create(p => p.SourceParatextId),
                        PathTemplateConfig<SFProject>.Create(p => p.SourceInputSystem),
                        PathTemplateConfig<SFProject>.Create(p => p.Sync),
                        PathTemplateConfig<SFProject>.Create(p => p.InputSystem),
                        PathTemplateConfig<SFProject>.Create(p => p.ParatextId),
                        PathTemplateConfig<SFProject>.Create(p => p.Texts),
                        PathTemplateConfig<SFProject>.Create(p => p.CheckingEnabled),
                        PathTemplateConfig<SFProject>.Create(p => p.TranslateEnabled)
                    });
                    o.ProjectRoles = SFProjectRoles.Instance;
                    o.ProjectDataDocs = new[]
                    {
                        new DocConfig(SFRootDataTypes.ProjectUserConfigs, OTType.Json0)
                        {
                            Domains = { new DomainConfig(SFDomain.ProjectUserConfigs) }
                        },
                        new DocConfig(SFRootDataTypes.Texts, OTType.RichText)
                        {
                            Domains = { new DomainConfig(SFDomain.Texts) }
                        },
                        new DocConfig(SFRootDataTypes.Questions)
                        {
                            Domains =
                            {
                                new DomainConfig(SFDomain.Questions)
                                {
                                    PathTemplate = PathTemplateConfig<QuestionList>.Create(ql => ql.Questions[-1])
                                },
                                new DomainConfig(SFDomain.Answers)
                                {
                                    PathTemplate = PathTemplateConfig<QuestionList>.Create(ql => ql.Questions[-1].Answers[-1])
                                },
                                new DomainConfig(SFDomain.Likes)
                                {
                                    PathTemplate = PathTemplateConfig<QuestionList>.Create(
                                        ql => ql.Questions[-1].Answers[-1].Likes[-1])
                                }
                            },
                            ImmutableProperties =
                            {
                                PathTemplateConfig<QuestionList>.Create(ql => ql.Questions[-1].Answers[-1].SyncUserRef)
                            }
                        },
                        new DocConfig(SFRootDataTypes.Comments)
                        {
                            Domains =
                            {
                                new DomainConfig(SFDomain.Comments)
                                {
                                    PathTemplate = PathTemplateConfig<CommentList>.Create(cl => cl.Comments[-1])
                                }
                            },
                            ImmutableProperties =
                            {
                                PathTemplateConfig<CommentList>.Create(cl => cl.Comments[-1].SyncUserRef)
                            }
                        }
                    };
                }, launchWithDebugging);
            return services;
        }
    }
}
