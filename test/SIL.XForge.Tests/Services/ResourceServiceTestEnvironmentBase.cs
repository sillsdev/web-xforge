using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AutoMapper;
using JsonApiDotNetCore.Builders;
using JsonApiDotNetCore.Configuration;
using JsonApiDotNetCore.Internal;
using JsonApiDotNetCore.Models;
using JsonApiDotNetCore.Services;
using Microsoft.Extensions.Options;
using NSubstitute;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public abstract class ResourceServiceTestEnvironmentBase<TResource, TEntity> : DisposableBase
        where TResource : class, IResource
        where TEntity : Entity, new()
    {
        public const string SiteId = "xf";
        public const string SiteAuthority = "xf.localhost:5000";
        public static readonly string TempDir = Path.Combine(Path.GetTempPath(), "ResourceServiceTests");
        public static readonly string SiteDir = Path.Combine(TempDir, "site");
        public static readonly string SharedDir = Path.Combine(TempDir, "shared");

        private readonly string _resourceName;

        protected ResourceServiceTestEnvironmentBase(string resourceName)
        {
            _resourceName = resourceName;

            var resourceGraphBuilder = new ResourceGraphBuilder();
            resourceGraphBuilder.AddResource<TResource, string>(_resourceName);
            SetupResourceGraph(resourceGraphBuilder);
            ResourceGraph = resourceGraphBuilder.Build();

            JsonApiContext = Substitute.For<IJsonApiContext>();
            JsonApiContext.ResourceGraph.Returns(ResourceGraph);
            JsonApiContext.RequestEntity.Returns(ResourceGraph.GetContextEntity(_resourceName));
            JsonApiContext.Options.Returns(new JsonApiOptions { IncludeTotalRecordCount = true });

            Entities = new MemoryRepository<TEntity>(GetUniqueKeySelectors(), GetInitialData());

            var config = new MapperConfiguration(cfg =>
                {
                    cfg.ValidateInlineMaps = false;
                    cfg.AddProfile(new XFMapperProfile(SiteId));
                    SetupMapper(cfg);
                });
            Mapper = config.CreateMapper();
            UserAccessor = Substitute.For<IUserAccessor>();
            UserAccessor.IsAuthenticated.Returns(false);

            SiteOptions = Substitute.For<IOptions<SiteOptions>>();
            SiteOptions.Value.Returns(new SiteOptions
            {
                Id = SiteId,
                Name = "xForge",
                Origin = new Uri("http://" + SiteAuthority),
                SiteDir = SiteDir,
                SharedDir = SharedDir
            });
        }

        public IResourceGraph ResourceGraph { get; }
        public IJsonApiContext JsonApiContext { get; }
        public IUserAccessor UserAccessor { get; }
        public MemoryRepository<TEntity> Entities { get; }
        public IMapper Mapper { get; }
        public IOptions<SiteOptions> SiteOptions { get; }

        public void SetUser(string userId, string role)
        {
            UserAccessor.IsAuthenticated.Returns(true);
            UserAccessor.UserId.Returns(userId);
            UserAccessor.SystemRole.Returns(role);
        }

        public AttrAttribute GetAttribute(string name)
        {
            ContextEntity resourceType = ResourceGraph.GetContextEntity(_resourceName);
            return resourceType.Attributes.First(a => a.PublicAttributeName == name);
        }

        public RelationshipAttribute GetRelationship(string name)
        {
            ContextEntity resourceType = ResourceGraph.GetContextEntity(_resourceName);
            return resourceType.Relationships.First(r => r.PublicRelationshipName == name);
        }

        public void CreateSiteDir()
        {
            if (Directory.Exists(SiteDir))
                Directory.Delete(SiteDir, true);
            Directory.CreateDirectory(SiteDir);
        }

        public void CreateSharedDir()
        {
            if (Directory.Exists(SharedDir))
                Directory.Delete(SharedDir, true);
            Directory.CreateDirectory(SharedDir);
        }

        protected virtual IEnumerable<Func<TEntity, object>> GetUniqueKeySelectors()
        {
            return null;
        }

        protected virtual IEnumerable<TEntity> GetInitialData()
        {
            return Enumerable.Empty<TEntity>();
        }

        protected virtual void SetupResourceGraph(IResourceGraphBuilder builder)
        {
        }

        protected virtual void SetupMapper(IMapperConfigurationExpression config)
        {
        }

        protected override void DisposeManagedResources()
        {
            if (Directory.Exists(TempDir))
                Directory.Delete(TempDir, true);
        }
    }
}
