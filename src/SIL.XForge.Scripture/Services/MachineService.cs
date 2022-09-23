using System.Threading.Tasks;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using MachineProject = SIL.Machine.WebApi.Models.Project;

namespace SIL.XForge.Scripture.Services
{
    public class MachineService : IMachineService
    {
        private readonly IEngineService _engineService;
        private readonly IRealtimeService _realtimeService;

        public MachineService(IEngineService engineService, IRealtimeService realtimeService)
        {
            _engineService = engineService;
            _realtimeService = realtimeService;
        }

        public async Task AddProjectAsync(string curUserId, string projectId)
        {
            using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
            if (!projectDoc.IsLoaded)
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Add the project to the in-memory Machine instance
            var machineProject = new MachineProject
            {
                Id = projectId,
                SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag,
                TargetLanguageTag = projectDoc.Data.WritingSystem.Tag
            };
            await _engineService.AddProjectAsync(machineProject);

            // TODO: Add the project to the Machine API
        }

        public async Task BuildProjectAsync(string curUserId, string projectId)
        {
            // Build the project with the in-memory Machine instance
            await _engineService.StartBuildByProjectIdAsync(projectId);

            // TODO: Build the project with the Machine API
        }

        public async Task RemoveProjectAsync(string curUserId, string projectId)
        {
            // Remove the project from the in-memory Machine instance
            await _engineService.RemoveProjectAsync(projectId);

            // TODO: Remove the project from the Machine API
        }
    }
}
