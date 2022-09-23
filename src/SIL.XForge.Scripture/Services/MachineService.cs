using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.Machine.WebApi.Services;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using MachineProject = SIL.Machine.WebApi.Models.Project;

#nullable enable

namespace SIL.XForge.Scripture.Services
{
    public class MachineService : DisposableBase, IMachineService
    {
        private readonly IEngineService _engineService;
        private readonly HttpClientHandler _httpClientHandler;
        private readonly HttpClient? _machineClient;
        private readonly IRealtimeService _realtimeService;

        public MachineService(
            IEngineService engineService,
            IWebHostEnvironment env,
            ILogger<MachineService> logger,
            IOptions<MachineOptions> machineOptions,
            IRealtimeService realtimeService
        )
        {
            _engineService = engineService;
            _realtimeService = realtimeService;
            _httpClientHandler = new HttpClientHandler();

            // Verify that we have the required machine options
            if (
                string.IsNullOrWhiteSpace(machineOptions.Value.ApiServer)
                || string.IsNullOrWhiteSpace(machineOptions.Value.Audience)
                || string.IsNullOrWhiteSpace(machineOptions.Value.ClientId)
                || string.IsNullOrWhiteSpace(machineOptions.Value.ClientSecret)
                || string.IsNullOrWhiteSpace(machineOptions.Value.TokenUrl)
            )
            {
                logger.LogWarning("Machine API not configured - using in-memory instance.");
                return;
            }

            // Setup the HTTP Client
            _machineClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback =
                    HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
            }
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

        protected override void DisposeManagedResources()
        {
            _machineClient?.Dispose();
            _httpClientHandler.Dispose();
        }
    }
}
