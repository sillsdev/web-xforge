using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public class MachineProjectService : IMachineProjectService
    {
        private readonly IEngineService _engineService;
        private readonly IFeatureManager _featureManager;
        private readonly ILogger<MachineProjectService> _logger;
        private readonly IMachineBuildService _machineBuildService;
        private readonly IMachineCorporaService _machineCorporaService;
        private readonly IMachineTranslationService _machineTranslationService;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;
        private readonly ITextCorpusFactory _textCorpusFactory;

        public MachineProjectService(
            IEngineService engineService,
            IFeatureManager featureManager,
            ILogger<MachineProjectService> logger,
            IMachineBuildService machineBuildService,
            IMachineCorporaService machineCorporaService,
            IMachineTranslationService machineTranslationService,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService,
            ITextCorpusFactory textCorpusFactory
        )
        {
            _engineService = engineService;
            _featureManager = featureManager;
            _logger = logger;
            _machineBuildService = machineBuildService;
            _machineCorporaService = machineCorporaService;
            _machineTranslationService = machineTranslationService;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
            _textCorpusFactory = textCorpusFactory;
        }

        public async Task AddProjectAsync(string curUserId, string projectId, CancellationToken cancellationToken)
        {
            // Load the project from the realtime service
            using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
            if (!projectDoc.IsLoaded)
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Add the project to the in-memory Machine instance
            var machineProject = new Project
            {
                Id = projectId,
                SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag,
                TargetLanguageTag = projectDoc.Data.WritingSystem.Tag,
            };
            await _engineService.AddProjectAsync(machineProject);

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Add the project to the Machine API
            string translationEngineId = await _machineTranslationService.CreateTranslationEngineAsync(
                projectId,
                machineProject.SourceLanguageTag,
                machineProject.TargetLanguageTag,
                cancellationToken
            );
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new ArgumentException("Translation Engine ID from the Machine API is missing.");
            }

            // Store the Translation Engine ID
            await _projectSecrets.UpdateAsync(
                projectId,
                u => u.Set(p => p.MachineData, new MachineData { TranslationEngineId = translationEngineId })
            );
        }

        public async Task BuildProjectAsync(
            string curUserId,
            string projectId,
            bool trainInMemoryEngine,
            CancellationToken cancellationToken
        )
        {
            // Build the project with the in-memory Machine instance
            if (trainInMemoryEngine)
            {
                await _engineService.StartBuildByProjectIdAsync(projectId);
            }

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine id
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.TranslationEngineId))
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {projectId}");
                return;
            }

            // Sync the corpus
            if (await SyncProjectCorporaAsync(curUserId, projectId, cancellationToken))
            {
                // If the corpus was updated, start the build
                // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that
                _ = await _machineBuildService.StartBuildAsync(
                    projectSecret.MachineData.TranslationEngineId,
                    cancellationToken
                );
            }
        }

        public async Task RemoveProjectAsync(string curUserId, string projectId, CancellationToken cancellationToken)
        {
            // Remove the project from the in-memory Machine instance
            await _engineService.RemoveProjectAsync(projectId);

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine id
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.TranslationEngineId))
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {projectId}");
                return;
            }

            // Remove the project from the Machine API
            await _machineTranslationService.DeleteTranslationEngineAsync(
                projectSecret.MachineData.TranslationEngineId,
                cancellationToken
            );

            // Ensure we have a corpus id
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.CorpusId))
            {
                _logger.LogInformation($"No Corpus Id specified for project {projectId}");
                return;
            }

            // Remove the corpus files
            string corpusId = projectSecret.MachineData.CorpusId;
            foreach (string fileId in projectSecret.MachineData.Files.Select(f => f.FileId))
            {
                try
                {
                    await _machineCorporaService.DeleteCorpusFileAsync(corpusId, fileId, cancellationToken);
                }
                catch (HttpRequestException ex)
                {
                    // A 404 means that the file does not exist
                    if (ex.StatusCode == HttpStatusCode.NotFound)
                    {
                        _logger.LogInformation(
                            $"Corpora file {fileId} in corpus {corpusId} for project {projectId} was missing or already deleted."
                        );
                    }
                }
            }

            // Remove the corpus
            try
            {
                await _machineCorporaService.DeleteCorpusAsync(corpusId, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                // A 404 means that the file does not exist
                if (ex.StatusCode == HttpStatusCode.NotFound)
                {
                    _logger.LogInformation(
                        $"Corpora {corpusId} for project {projectId} was missing or already deleted."
                    );
                }
            }
        }

        public async Task<bool> SyncProjectCorporaAsync(
            string curUserId,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            // We will return whether the corpus was updated
            bool corpusUpdated = false;

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return false;
            }

            // Load the project from the realtime service
            using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
            if (!projectDoc.IsLoaded)
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Load the project secrets, so we can get the corpus files
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine ID
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.TranslationEngineId))
            {
                throw new ArgumentException("The translation engine ID cannot be found.");
            }

            // Ensure that there is a corpus
            string corpusId;
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData.CorpusId))
            {
                corpusId = await _machineCorporaService.CreateCorpusAsync(
                    projectId,
                    paratext: false,
                    cancellationToken
                );
                await _machineCorporaService.AddCorpusToTranslationEngineAsync(
                    projectSecret.MachineData.TranslationEngineId,
                    corpusId,
                    false,
                    cancellationToken
                );

                // Store the Corpus ID
                await _projectSecrets.UpdateAsync(projectId, u => u.Set(p => p.MachineData.CorpusId, corpusId));
            }
            else
            {
                corpusId = projectSecret.MachineData.CorpusId;
            }

            // Get the corpus files on the server
            IList<MachineApiCorpusFile> serverCorpusFiles = await _machineCorporaService.GetCorpusFilesAsync(
                corpusId,
                cancellationToken
            );

            // Reuse the SFTextCorpusFactory implementation
            ITextCorpus? textCorpus = await _textCorpusFactory.CreateAsync(new[] { projectId }, TextCorpusType.Source);
            corpusUpdated |= await SyncTextCorpusAsync(
                corpusId,
                projectDoc.Data,
                projectSecret,
                textCorpus,
                TextCorpusType.Source,
                serverCorpusFiles,
                cancellationToken
            );

            textCorpus = await _textCorpusFactory.CreateAsync(new[] { projectId }, TextCorpusType.Target);
            corpusUpdated |= await SyncTextCorpusAsync(
                corpusId,
                projectDoc.Data,
                projectSecret,
                textCorpus,
                TextCorpusType.Target,
                serverCorpusFiles,
                cancellationToken
            );

            return corpusUpdated;
        }

        private async Task<bool> SyncTextCorpusAsync(
            string corpusId,
            SFProject project,
            SFProjectSecret projectSecret,
            ITextCorpus? textCorpus,
            TextCorpusType type,
            IList<MachineApiCorpusFile> serverCorpusFiles,
            CancellationToken cancellationToken
        )
        {
            // We will return whether the corpus was updated
            bool corpusUpdated = false;

            // Get the language tag
            string languageTag;
            if (type == TextCorpusType.Target)
            {
                languageTag = project.WritingSystem.Tag;
            }
            else
            {
                languageTag = project.TranslateConfig.Source.WritingSystem.Tag;
            }

            // Get the files we have already synced
            List<MachineCorpusFile> previousCorpusFiles =
                projectSecret.MachineData?.Files ?? new List<MachineCorpusFile>();

            // Sync each text
            var sb = new StringBuilder();
            foreach (IText text in textCorpus?.Texts ?? Array.Empty<IText>())
            {
                sb.Clear();
                foreach (TextSegment segment in text.GetSegments())
                {
                    if (!segment.IsEmpty)
                    {
                        if (segment.SegmentRef is TextSegmentRef textSegmentRef)
                        {
                            sb.Append(string.Join('-', textSegmentRef.Keys));
                        }
                        else
                        {
                            sb.Append(segment.SegmentRef);
                        }

                        sb.Append('\t');
                        sb.Append(string.Join(' ', segment.Segment));
                        sb.Append('\t');
                        if (segment.IsSentenceStart)
                        {
                            sb.Append("ss,");
                        }

                        if (segment.IsInRange)
                        {
                            sb.Append("ir,");
                        }

                        if (segment.IsRangeStart)
                        {
                            sb.Append("rs,");
                        }

                        // Strip the last comma, or the tab if there are no flags
                        sb.Length--;
                        sb.AppendLine();
                    }
                }

                if (sb.Length > 0)
                {
                    // See if the corpus exists, and delete it if it does
                    bool uploadText = false;
                    string textId = $"{text.Id}_{type.ToString().ToLowerInvariant()}";
                    string textFileData = sb.ToString();
                    string checksum = StringUtils.ComputeMd5Hash(textFileData);
                    MachineCorpusFile? previousCorpusFile = previousCorpusFiles.FirstOrDefault(c => c.TextId == textId);
                    if (previousCorpusFile is null)
                    {
                        uploadText = true;
                    }
                    else if (previousCorpusFile.FileChecksum != checksum)
                    {
                        // Only delete the file if it is present in the Machine API
                        if (serverCorpusFiles.Any(c => c.Id == previousCorpusFile.FileId))
                        {
                            await _machineCorporaService.DeleteCorpusFileAsync(
                                corpusId,
                                previousCorpusFile.FileId,
                                cancellationToken
                            );
                        }

                        uploadText = true;
                    }

                    // Upload the file if it is not there, or has changed
                    if (uploadText)
                    {
                        string fileId = await _machineCorporaService.UploadCorpusTextAsync(
                            corpusId,
                            languageTag,
                            textId,
                            textFileData,
                            cancellationToken
                        );

                        // Record the fileId and checksum, matching the text id
                        int? index = projectSecret.MachineData?.Files.FindIndex(f => f.TextId == textId);
                        if (previousCorpusFile is null || index is null or -1)
                        {
                            // If the index is null, the files collection does not exist
                            if (index is null)
                            {
                                // Create the files collection with the file information
                                await _projectSecrets.UpdateAsync(
                                    projectSecret,
                                    u =>
                                        u.Set(
                                            p => p.MachineData.Files,
                                            new List<MachineCorpusFile>
                                            {
                                                new MachineCorpusFile
                                                {
                                                    FileChecksum = checksum,
                                                    FileId = fileId,
                                                    LanguageTag = languageTag,
                                                    TextId = textId,
                                                },
                                            }
                                        )
                                );
                            }
                            else
                            {
                                // Add the file information to the project secret
                                await _projectSecrets.UpdateAsync(
                                    projectSecret,
                                    u =>
                                        u.Add(
                                            p => p.MachineData.Files,
                                            new MachineCorpusFile
                                            {
                                                FileChecksum = checksum,
                                                FileId = fileId,
                                                LanguageTag = languageTag,
                                                TextId = textId,
                                            }
                                        )
                                );
                            }
                        }
                        else
                        {
                            // Update the file information in the project secret
                            await _projectSecrets.UpdateAsync(
                                projectSecret,
                                u =>
                                    u.Set(p => p.MachineData.Files[index.Value].FileChecksum, checksum)
                                        .Set(p => p.MachineData.Files[index.Value].FileId, fileId)
                                        .Set(p => p.MachineData.Files[index.Value].LanguageTag, languageTag)
                            );
                        }

                        corpusUpdated = true;
                    }
                }
            }

            return corpusUpdated;
        }
    }
}
