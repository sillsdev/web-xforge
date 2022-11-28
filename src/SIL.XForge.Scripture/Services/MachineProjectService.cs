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
    /// <summary>
    /// Provides functionality to add, remove, and build Machine projects in both
    /// the In-Process Machine and Machine API implementations.
    /// </summary>
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

        public async Task AddProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
        {
            // Load the project from the realtime service
            Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
            if (!attempt.TryResult(out SFProject project))
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Add the project to the in process Machine instance
            var machineProject = new Project
            {
                Id = sfProjectId,
                SourceLanguageTag = project.TranslateConfig.Source.WritingSystem.Tag,
                TargetLanguageTag = project.WritingSystem.Tag,
            };

            // Only add to the in-memory instance if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInMemory))
            {
                await _engineService.AddProjectAsync(machineProject);
            }

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Add the project to the Machine API
            string translationEngineId = await _machineTranslationService.CreateTranslationEngineAsync(
                name: sfProjectId,
                machineProject.SourceLanguageTag,
                machineProject.TargetLanguageTag,
                smtTransfer: true,
                cancellationToken
            );
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new ArgumentException("Translation Engine ID from the Machine API is missing.");
            }

            // Store the Translation Engine ID
            await _projectSecrets.UpdateAsync(
                sfProjectId,
                u => u.Set(p => p.MachineData, new MachineData { TranslationEngineId = translationEngineId })
            );
        }

        public async Task BuildProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
        {
            // Build the project with the in-memory Machine instance
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInMemory))
            {
                await _engineService.StartBuildByProjectIdAsync(sfProjectId);
            }

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine id
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.TranslationEngineId))
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
                return;
            }

            // Sync the corpus
            if (await SyncProjectCorporaAsync(curUserId, sfProjectId, cancellationToken))
            {
                // If the corpus was updated, start the build
                // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that
                _ = await _machineBuildService.StartBuildAsync(
                    projectSecret.MachineData.TranslationEngineId,
                    cancellationToken
                );
            }
        }

        public async Task RemoveProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
        {
            // Remove the project from the in-memory Machine instance
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInMemory))
            {
                await _engineService.RemoveProjectAsync(sfProjectId);
            }

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return;
            }

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine id
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData?.TranslationEngineId))
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
                return;
            }

            // Remove the corpus files
            foreach ((string corpusId, _) in projectSecret.MachineData.Corpora)
            {
                foreach (string fileId in projectSecret.MachineData.Corpora[corpusId].Files.Select(f => f.FileId))
                {
                    try
                    {
                        await _machineCorporaService.DeleteCorpusFileAsync(corpusId, fileId, cancellationToken);
                    }
                    catch (HttpRequestException e)
                    {
                        // A 404 means that the file does not exist
                        string message;
                        if (e.StatusCode == HttpStatusCode.NotFound)
                        {
                            message =
                                $"Corpora file {fileId} in corpus {corpusId} for project {sfProjectId}"
                                + " was missing or already deleted.";
                            _logger.LogInformation(message);
                        }
                        else
                        {
                            message =
                                $"Ignored exception while deleting file {fileId} in corpus {corpusId}"
                                + $" for project {sfProjectId}.";
                            _logger.LogError(e, message);
                        }
                    }
                }

                // Remove the corpus from the translation engine
                string translationEngineId = projectSecret.MachineData.TranslationEngineId;
                try
                {
                    await _machineCorporaService.RemoveCorpusFromTranslationEngineAsync(
                        translationEngineId,
                        corpusId,
                        cancellationToken
                    );
                }
                catch (HttpRequestException e)
                {
                    // A 404 means that the translation engine does not exist
                    string message;
                    if (e.StatusCode == HttpStatusCode.NotFound)
                    {
                        message =
                            $"Translation Engine {translationEngineId} for project {sfProjectId}"
                            + " was missing or already deleted.";
                        _logger.LogInformation(message);
                    }
                    else
                    {
                        message =
                            $"Ignored exception while deleting translation engine {translationEngineId}"
                            + $" for project {sfProjectId}.";
                        _logger.LogError(e, message);
                    }
                }

                // Delete the corpus
                try
                {
                    await _machineCorporaService.DeleteCorpusAsync(corpusId, cancellationToken);
                }
                catch (HttpRequestException e)
                {
                    // A 404 means that the corpus does not exist
                    string message;
                    if (e.StatusCode == HttpStatusCode.NotFound)
                    {
                        message = $"Corpus {corpusId} for project {sfProjectId} was missing or already deleted.";
                        _logger.LogInformation(message);
                    }
                    else
                    {
                        message = $"Ignored exception while deleting corpus {corpusId} for project {sfProjectId}.";
                        _logger.LogError(e, message);
                    }
                }
            }

            // Remove the project from the Machine API
            await _machineTranslationService.DeleteTranslationEngineAsync(
                projectSecret.MachineData.TranslationEngineId,
                cancellationToken
            );
        }

        /// <summary>
        /// Syncs the project corpora from MongoDB to the Machine API via <see cref="SFTextCorpusFactory"/>
        /// </summary>
        /// <param name="curUserId">The current user identifier.</param>
        /// <param name="sfProjectId">The project identifier.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns><c>true</c> if the project corpora and its files were updated; otherwise, <c>false</c>.</returns>
        /// <exception cref="DataNotFoundException">The project does not exist.</exception>
        /// <exception cref="ArgumentException">One of the arguments was an invalid identifier.</exception>
        /// <remarks>
        /// Notes:
        ///  - If the corpus was updated, then you should start the Build with <see cref="MachineBuildService"/>.
        ///  - If the Machine API feature flag is disabled, false is returned and an information message logged.
        ///  - If a corpus is not configured on the Machine API, one is created and recorded in the project secret.
        /// </remarks>
        public async Task<bool> SyncProjectCorporaAsync(
            string curUserId,
            string sfProjectId,
            CancellationToken cancellationToken
        )
        {
            // Used to return whether or not the corpus was updated
            bool corpusUpdated = false;

            // Ensure that the Machine API feature flag is enabled
            if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                _logger.LogInformation("Machine API feature flag is not enabled");
                return false;
            }

            // Load the project from the realtime service
            Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
            if (!attempt.TryResult(out SFProject project))
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Load the project secrets, so we can get the corpus files
            if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
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
            if (string.IsNullOrWhiteSpace(projectSecret.MachineData.Corpora.Keys.FirstOrDefault()))
            {
                corpusId = await _machineCorporaService.CreateCorpusAsync(
                    sfProjectId,
                    paratext: false,
                    cancellationToken
                );
                await _machineCorporaService.AddCorpusToTranslationEngineAsync(
                    projectSecret.MachineData.TranslationEngineId,
                    corpusId,
                    pretranslate: false,
                    cancellationToken
                );

                // Store the Corpus ID
                projectSecret = await _projectSecrets.UpdateAsync(
                    sfProjectId,
                    u =>
                        u.Set(
                            p => p.MachineData.Corpora[corpusId],
                            new MachineCorpus { Files = new List<MachineCorpusFile>() }
                        )
                );
            }
            else
            {
                corpusId = projectSecret.MachineData.Corpora.Keys.First();
            }

            // Get the corpus files on the server
            IList<MachineApiCorpusFile> serverCorpusFiles = await _machineCorporaService.GetCorpusFilesAsync(
                corpusId,
                cancellationToken
            );

            // Reuse the SFTextCorpusFactory implementation
            ITextCorpus? textCorpus = await _textCorpusFactory.CreateAsync(
                new[] { sfProjectId },
                TextCorpusType.Source
            );
            corpusUpdated |= await SyncTextCorpusAsync(
                corpusId,
                project,
                projectSecret,
                textCorpus,
                TextCorpusType.Source,
                serverCorpusFiles,
                cancellationToken
            );

            textCorpus = await _textCorpusFactory.CreateAsync(new[] { sfProjectId }, TextCorpusType.Target);
            corpusUpdated |= await SyncTextCorpusAsync(
                corpusId,
                project,
                projectSecret,
                textCorpus,
                TextCorpusType.Target,
                serverCorpusFiles,
                cancellationToken
            );

            return corpusUpdated;
        }

        /// <summary>
        /// Gets the segments from the text with Unix/Linux line endings.
        /// </summary>
        /// <param name="text">The IText</param>
        /// <returns>The text file data to be uploaded to the Machine API.</returns>
        private static string GetTextFileData(IText text)
        {
            var sb = new StringBuilder();
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

                    // Append the Unix EOL to ensure consistency as this text data is uploaded to the Machine API
                    sb.Append('\n');
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Syncs an <see cref="ITextCorpus"/> with a corpus on the Machine APU, creating and updating corpus
        /// files on the corpus as necessary, and recording the details in the <see cref="projectSecret"/>.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="project">The project.</param>
        /// <param name="projectSecret">The project secret.</param>
        /// <param name="textCorpus">The text corpus created by <see cref="SFTextCorpusFactory"/>.</param>
        /// <param name="type">The type can be either Source or Target.</param>
        /// <param name="serverCorpusFiles">The corpus files already on the server, from the Machine API.</param>
        /// <param name="cancellationToken"></param>
        /// <returns><c>true</c> if the corpus was created or updated; otherwise, <c>false</c>.</returns>
        /// <remarks>
        /// The project secret is updated with the corpus file details added or updated on the Machine API.
        /// </remarks>
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
            // Used to return whether or not the corpus files were created or updated
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
                projectSecret.MachineData?.Corpora[corpusId].Files ?? new List<MachineCorpusFile>();

            // Sync each text
            foreach (IText text in textCorpus?.Texts ?? Array.Empty<IText>())
            {
                string textFileData = GetTextFileData(text);
                if (!string.IsNullOrWhiteSpace(textFileData))
                {
                    // See if the corpus exists, and delete it if it does
                    bool uploadText = false;
                    string textId = $"{text.Id}_{type.ToString().ToLowerInvariant()}";
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
                        int? index = projectSecret.MachineData?.Corpora[corpusId].Files.FindIndex(
                            f => f.TextId == textId
                        );

                        if (previousCorpusFile is null || index is null or -1)
                        {
                            // Add the file information to the project secret
                            projectSecret = await _projectSecrets.UpdateAsync(
                                projectSecret,
                                u =>
                                    u.Add(
                                        p => p.MachineData.Corpora[corpusId].Files,
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
                        else
                        {
                            // Update the file information in the project secret
                            projectSecret = await _projectSecrets.UpdateAsync(
                                projectSecret,
                                u =>
                                    u.Set(
                                            p => p.MachineData.Corpora[corpusId].Files[index.Value].FileChecksum,
                                            checksum
                                        )
                                        .Set(p => p.MachineData.Corpora[corpusId].Files[index.Value].FileId, fileId)
                                        .Set(
                                            p => p.MachineData.Corpora[corpusId].Files[index.Value].LanguageTag,
                                            languageTag
                                        )
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
