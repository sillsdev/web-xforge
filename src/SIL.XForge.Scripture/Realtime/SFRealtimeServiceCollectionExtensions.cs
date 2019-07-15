using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class SFRealtimeServiceCollectionExtensions
    {
        public static IServiceCollection AddSFRealtimeServer(this IServiceCollection services,
            IConfiguration configuration, bool launchWithDebugging = false)
        {
            services.AddRealtimeServer(configuration, o =>
                {
                    o.ProjectRoles = SFProjectRoles.Instance;
                    o.ProjectDataDocs = new[]
                    {
                        new RealtimeDocConfig(RootDataTypes.Projects),
                        new RealtimeDocConfig(SFRootDataTypes.Texts, OTType.RichText)
                        {
                            Domains = { new RealtimeDomainConfig(SFDomain.Texts) }
                        },
                        new RealtimeDocConfig(SFRootDataTypes.Questions)
                        {
                            Domains =
                            {
                                new RealtimeDomainConfig(SFDomain.Questions)
                                {
                                    PathTemplate = QuestionsPath(qs => qs[-1])
                                },
                                new RealtimeDomainConfig(SFDomain.Answers)
                                {
                                    PathTemplate = QuestionsPath(qs => qs[-1].Answers[-1])
                                },
                                new RealtimeDomainConfig(SFDomain.Likes)
                                {
                                    PathTemplate = QuestionsPath(qs => qs[-1].Answers[-1].Likes[-1])
                                }
                            },
                            ImmutableProperties =
                            {
                                QuestionsPath(qs => qs[-1].Answers[-1].SyncUserRef)
                            }
                        },
                        new RealtimeDocConfig(SFRootDataTypes.Comments)
                        {
                            Domains =
                            {
                                new RealtimeDomainConfig(SFDomain.Comments)
                                {
                                    PathTemplate = CommentsPath(cs => cs[-1])
                                }
                            },
                            ImmutableProperties =
                            {
                                CommentsPath(cs => cs[-1].SyncUserRef)
                            }
                        }
                    };
                }, launchWithDebugging);
            return services;
        }

        private static ObjectPath QuestionsPath<TField>(Expression<Func<List<Question>, TField>> field)
        {
            return new ObjectPath(field);
        }

        private static ObjectPath CommentsPath<TField>(Expression<Func<List<Comment>, TField>> field)
        {
            return new ObjectPath(field);
        }
    }
}
