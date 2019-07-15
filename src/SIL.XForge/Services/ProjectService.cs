using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Internal.Query;
using JsonApiDotNetCore.Services;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Services
{
    public abstract class ProjectService<TResource, TEntity> : RepositoryResourceServiceBase<TResource, TEntity>,
        IResourceMapper<ProjectResource, ProjectEntity>, IProjectService<TResource>
        where TResource : ProjectResource
        where TEntity : ProjectEntity
    {

        private readonly IOptions<SiteOptions> _siteOptions;

        public ProjectService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<TEntity> projects, IOptions<SiteOptions> siteOptions)
            : base(jsonApiContext, mapper, userAccessor, projects)
        {
            _siteOptions = siteOptions;
        }

        public IResourceMapper<ProjectUserResource, ProjectUserEntity> ProjectUserMapper { get; set; }

        protected override IRelationship<TEntity> GetRelationship(string relationshipName)
        {
            switch (relationshipName)
            {
                case nameof(ProjectResource.Users):
                    return HasMany(ProjectUserMapper, u => u.ProjectRef);
            }
            return base.GetRelationship(relationshipName);
        }

        protected override Task CheckCanCreateAsync(TResource resource)
        {
            return Task.CompletedTask;
        }

        protected override Task CheckCanUpdateAsync(string id, IDictionary<string, object> attrs,
            IDictionary<string, string> relationships)
        {
            return CheckCanUpdateDeleteAsync(id);
        }

        protected override Task CheckCanUpdateRelationshipAsync(string id)
        {
            return CheckCanUpdateDeleteAsync(id);
        }

        protected override Task CheckCanDeleteAsync(string id)
        {
            return CheckCanUpdateDeleteAsync(id);
        }

        protected override Task<IQueryable<TEntity>> ApplyPermissionFilterAsync(IQueryable<TEntity> query)
        {
            if (SystemRole == SystemRoles.User)
                query = query.Where(p => p.Users.Any(u => u.UserRef == UserId));
            return Task.FromResult(query);
        }

        protected override IQueryable<TEntity> ApplyFilter(IQueryable<TEntity> entities, FilterQuery filter)
        {
            if (filter.Attribute == "search")
            {
                string value = filter.Value.ToLowerInvariant();
                return entities.Where(p => p.ProjectName.ToLowerInvariant().Contains(value)
                    || p.InputSystem.LanguageName.ToLowerInvariant().Contains(value));
            }
            return base.ApplyFilter(entities, filter);
        }

        private async Task CheckCanUpdateDeleteAsync(string id)
        {
            if (SystemRole == SystemRoles.User)
            {
                Attempt<TEntity> attempt = await Entities.TryGetAsync(id);
                if (attempt.TryResult(out TEntity project))
                {
                    if (!project.Users.Any(u => u.UserRef == UserId))
                        throw ForbiddenException();
                }
                else
                {
                    throw NotFoundException();
                }
            }
        }

        async Task<ProjectResource> IResourceMapper<ProjectResource, ProjectEntity>.MapAsync(
            IEnumerable<string> included, Dictionary<string, IResource> resources, ProjectEntity entity)
        {
            return await MapAsync(included, resources, (TEntity)entity);
        }

        async Task<IEnumerable<ProjectResource>> IResourceMapper<ProjectResource, ProjectEntity>.MapMatchingAsync(
            IEnumerable<string> included, Dictionary<string, IResource> resources,
            Expression<Func<ProjectEntity, bool>> predicate)
        {
            return await MapMatchingAsync(included, resources, ExpressionHelper.ChangePredicateType<TEntity>(predicate));
        }

        public async Task<Uri> SaveAudioAsync(string projectId, string fileName, Stream inputStream)
        {
            await CheckCanUpdateDeleteAsync(projectId);

            string audioDir = Path.Combine(_siteOptions.Value.SharedDir, "audio");
            if (!Directory.Exists(audioDir))
                Directory.CreateDirectory(audioDir);
            string path = Path.Combine(audioDir, fileName);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
            using (var fileStream = new FileStream(path, FileMode.Create))
                await inputStream.CopyToAsync(fileStream);
            var uri = new Uri(_siteOptions.Value.Origin,
                $"/assets/audio/{fileName}");
            return uri;
        }
    }
}
