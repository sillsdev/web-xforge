using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Services;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class SFProjectService : ProjectService<SFProjectResource, SFProjectEntity>
    {
        private readonly IEngineService _engineService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly SyncJobManager _syncJobManager;
        private readonly IRealtimeService _realtimeService;

        public SFProjectService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<SFProjectEntity> projects, IEngineService engineService, IOptions<SiteOptions> siteOptions,
            SyncJobManager syncJobManager, IRealtimeService realtimeService)
            : base(jsonApiContext, mapper, userAccessor, projects)
        {
            _engineService = engineService;
            _siteOptions = siteOptions;
            _syncJobManager = syncJobManager;
            _realtimeService = realtimeService;
        }

        public IProjectDataMapper<SyncJobResource, SyncJobEntity> SyncJobMapper { get; set; }

        protected override IRelationship<SFProjectEntity> GetRelationship(string relationshipName)
        {
            switch (relationshipName)
            {
                case nameof(SFProjectResource.ActiveSyncJob):
                    return HasOne(SyncJobMapper, p => p.ActiveSyncJobRef);
            }
            return base.GetRelationship(relationshipName);
        }

        protected override async Task<SFProjectEntity> InsertEntityAsync(SFProjectEntity entity)
        {
            var projectUser = new SFProjectUserEntity
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserRef = UserId,
                Role = SFProjectRoles.Administrator
            };
            entity.Users.Add(projectUser);
            entity = await base.InsertEntityAsync(entity);
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<SFProjectData> projectDataDoc = conn.Get<SFProjectData>(RootDataTypes.Projects, entity.Id);
                await projectDataDoc.CreateAsync(new SFProjectData());
            }
            if (entity.TranslateEnabled)
            {
                var project = new Project
                {
                    Id = entity.Id,
                    SourceLanguageTag = entity.SourceInputSystem.Tag,
                    TargetLanguageTag = entity.InputSystem.Tag
                };
                await _engineService.AddProjectAsync(project);
            }

            var job = new SyncJobEntity()
            {
                Id = entity.ActiveSyncJobRef,
                ProjectRef = entity.Id,
                OwnerRef = UserId
            };
            await _syncJobManager.StartAsync(job, true);

            return entity;
        }

        protected override async Task<bool> DeleteEntityAsync(string id)
        {
            bool result = await base.DeleteEntityAsync(id);
            if (result)
            {
                await SyncJobMapper.DeleteAllAsync(id);

                await _realtimeService.DeleteProjectDocsAsync(SFRootDataTypes.Texts, id);
                await _realtimeService.DeleteProjectDocsAsync(SFRootDataTypes.Questions, id);
                await _realtimeService.DeleteProjectDocsAsync(SFRootDataTypes.Comments, id);
                await _realtimeService.DeleteProjectDocsAsync(RootDataTypes.Projects, id);

                await _engineService.RemoveProjectAsync(id);
                string syncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync", id);
                if (Directory.Exists(syncDir))
                    Directory.Delete(syncDir, true);
            }
            return result;
        }

        protected override async Task<SFProjectEntity> UpdateEntityAsync(string id, IDictionary<string, object> attrs,
            IDictionary<string, string> relationships)
        {
            SFProjectEntity entity = await base.UpdateEntityAsync(id, attrs, relationships);
            bool translateEnabledSet = attrs.ContainsKey(nameof(SFProjectResource.TranslateEnabled));
            bool sourceParatextIdSet = attrs.ContainsKey(nameof(SFProjectResource.SourceParatextId));
            bool checkingEnabledSet = attrs.ContainsKey(nameof(SFProjectResource.CheckingEnabled));
            // check if a sync needs to be run
            if (translateEnabledSet || sourceParatextIdSet || checkingEnabledSet)
            {
                // if currently running sync job for project is found, cancel it
                await _syncJobManager.CancelByProjectIdAsync(id);

                bool trainEngine = false;
                if (translateEnabledSet || sourceParatextIdSet)
                {
                    if (entity.TranslateEnabled && entity.SourceParatextId != null)
                    {
                        // translate task was enabled or source project changed

                        // recreate Machine project only if source project changed
                        if (!translateEnabledSet && sourceParatextIdSet)
                            await _engineService.RemoveProjectAsync(entity.Id);
                        var project = new Project
                        {
                            Id = entity.Id,
                            SourceLanguageTag = entity.SourceInputSystem.Tag,
                            TargetLanguageTag = entity.InputSystem.Tag
                        };
                        await _engineService.AddProjectAsync(project);
                        trainEngine = true;
                    }
                    else
                    {
                        // translate task was disabled or source project set to null
                        await _engineService.RemoveProjectAsync(entity.Id);
                    }
                }

                var job = new SyncJobEntity()
                {
                    ProjectRef = id,
                    OwnerRef = UserId
                };
                await _syncJobManager.StartAsync(job, trainEngine);
            }
            return entity;
        }
    }
}
