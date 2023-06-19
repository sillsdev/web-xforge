using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using Serval.Client;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

// Disable notice "The logging message template should not vary between calls to..."
#pragma warning disable CA2254

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides functionality to add, remove, and build Machine projects in both
/// the In-Process Machine and Serval implementations.
/// </summary>
public class MachineProjectService : IMachineProjectService
{
    private readonly IDataFilesClient _dataFilesClient;
    private readonly IEngineService _engineService;
    private readonly IFeatureManager _featureManager;
    private readonly ILogger<MachineProjectService> _logger;
    private readonly IParatextService _paratextService;
    private readonly IRepository<SFProjectSecret> _projectSecrets;
    private readonly IRealtimeService _realtimeService;
    private readonly ISFTextCorpusFactory _textCorpusFactory;
    private readonly ITranslationEnginesClient _translationEnginesClient;
    private readonly IRepository<UserSecret> _userSecrets;

    public MachineProjectService(
        IDataFilesClient dataFilesClient,
        IEngineService engineService,
        IFeatureManager featureManager,
        ILogger<MachineProjectService> logger,
        IParatextService paratextService,
        IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService,
        ISFTextCorpusFactory textCorpusFactory,
        ITranslationEnginesClient translationEnginesClient,
        IRepository<UserSecret> userSecrets
    )
    {
        _dataFilesClient = dataFilesClient;
        _engineService = engineService;
        _featureManager = featureManager;
        _logger = logger;
        _paratextService = paratextService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
        _textCorpusFactory = textCorpusFactory;
        _translationEnginesClient = translationEnginesClient;
        _userSecrets = userSecrets;
    }

    public async Task AddProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Add the project to the in process Machine instance
        var machineProject = new Machine.WebApi.Models.Project
        {
            Id = sfProjectId,
            SourceLanguageTag = project.TranslateConfig.Source.WritingSystem.Tag,
            TargetLanguageTag = project.WritingSystem.Tag,
        };

        // Only add to the In Process instance if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.AddProjectAsync(machineProject);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return;
        }

        // We may not have the source language tag or target language tag if either is a back translation
        // If that is the case, we will create the translation engine on first sync by running this method again
        // After ensuring that the source and target language tags are present
        if (
            !string.IsNullOrWhiteSpace(machineProject.SourceLanguageTag)
            && !string.IsNullOrWhiteSpace(machineProject.TargetLanguageTag)
        )
        {
            // We do not need the returned project secret
            await CreateServalProjectAsync(project, preTranslate, cancellationToken);
        }
    }

    public async Task<TranslationBuild?> BuildProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Build the project with the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.StartBuildByProjectIdAsync(sfProjectId);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return null;
        }

        // Load the target project secrets, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id or a pre-translation engine id
        if (
            (string.IsNullOrWhiteSpace(projectSecret.ServalData?.PreTranslationEngineId) && preTranslate)
            || (string.IsNullOrWhiteSpace(projectSecret.ServalData?.TranslationEngineId) && !preTranslate)
        )
        {
            // We do not have one, likely because the translation is a back translation
            // We can only get the language tags for back translations from the ScrText,
            // which is not present until after the first sync (not from the Registry).

            // Load the project from the realtime service
            await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
            if (!projectDoc.IsLoaded)
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // If the source or target writing system tag is missing, get them from the ScrText
            if (
                string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag)
                || string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag)
            )
            {
                // Get the user secret
                Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    throw new DataNotFoundException("The user does not exist.");

                // Update the target writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag))
                {
                    string targetLanguageTag = _paratextService.GetLanguageId(userSecret, projectDoc.Data.ParatextId);
                    if (!string.IsNullOrEmpty(targetLanguageTag))
                    {
                        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.WritingSystem.Tag, targetLanguageTag));
                    }
                }

                // Update the source writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag))
                {
                    string sourceLanguageTag = _paratextService.GetLanguageId(
                        userSecret,
                        projectDoc.Data.TranslateConfig.Source.ParatextId
                    );
                    if (!string.IsNullOrEmpty(sourceLanguageTag))
                    {
                        await projectDoc.SubmitJson0OpAsync(
                            op => op.Set(p => p.TranslateConfig.Source.WritingSystem.Tag, sourceLanguageTag)
                        );
                    }
                }
            }

            // If the pre-translate flag is not set, set it now for the front-end UI
            if (preTranslate && !projectDoc.Data.TranslateConfig.PreTranslate)
            {
                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.TranslateConfig.PreTranslate, true));
            }

            // Create the Serval project
            // The returned project secret will have the translation engine id
            projectSecret = await CreateServalProjectAsync(projectDoc.Data, preTranslate, cancellationToken);
        }

        // Sync the corpus
        if ((await SyncProjectCorporaAsync(curUserId, sfProjectId, preTranslate, cancellationToken)) || preTranslate)
        {
            // If the corpus was updated (or this is a pre-translation engine), start the build
            // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that

            // Get the appropriate translation engine
            string translationEngineId;
            TranslationBuildConfig translationBuildConfig;
            if (preTranslate)
            {
                // Get the updated project secrets
                projectSecret = await _projectSecrets.GetAsync(sfProjectId);
                translationEngineId = projectSecret.ServalData!.PreTranslationEngineId;

                // Execute a complete pre-translation
                translationBuildConfig = GetTranslationBuildConfig(projectSecret.ServalData);
            }
            else
            {
                translationEngineId = projectSecret.ServalData!.TranslationEngineId;
                translationBuildConfig = new TranslationBuildConfig();
            }

            // Start a build if:
            // - This is an SMT build (i.e. preTranslate is false)
            // - This is an NMT build and no pre-translation build is queued
            if (!preTranslate || !await PreTranslationBuildQueuedAsync(translationEngineId))
            {
                return await _translationEnginesClient.StartBuildAsync(
                    translationEngineId,
                    translationBuildConfig,
                    cancellationToken
                );
            }
        }

        // No build started
        return null;
    }

    public async Task RemoveProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Remove the project from the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.RemoveProjectAsync(sfProjectId);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return;
        }

        // Load the target project secrets, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            _logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
            return;
        }

        // Remove the corpus files
        foreach (
            (string corpusId, _) in projectSecret.ServalData.Corpora.Where(c => c.Value.PreTranslate == preTranslate)
        )
        {
            foreach (
                string fileId in projectSecret.ServalData.Corpora[corpusId].SourceFiles
                    .Concat(projectSecret.ServalData.Corpora[corpusId].TargetFiles)
                    .Select(f => f.FileId)
            )
            {
                try
                {
                    await _dataFilesClient.DeleteAsync(fileId, cancellationToken);
                }
                catch (ServalApiException e)
                {
                    // A 404 means that the file does not exist
                    string message;
                    if (e.StatusCode == StatusCodes.Status404NotFound)
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

            // Delete the corpus
            try
            {
                await _translationEnginesClient.DeleteCorpusAsync(translationEngineId, corpusId, cancellationToken);
            }
            catch (ServalApiException e)
            {
                // A 404 means that the translation engine does not exist
                string message;
                if (e.StatusCode == StatusCodes.Status404NotFound)
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

            // Remove our record of the corpus
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.Corpora[corpusId]));
        }

        // Remove the project from Serval
        await _translationEnginesClient.DeleteAsync(translationEngineId, cancellationToken);

        // Remove the Serval Data
        if (preTranslate)
        {
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationEngineId));
        }
        else
        {
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.TranslationEngineId));
        }
    }

    /// <summary>
    /// Syncs the project corpora from MongoDB to Serval via <see cref="SFTextCorpusFactory"/>
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId">The project identifier.</param>
    /// <param name="preTranslate">The project is for pre-translation.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns><c>true</c> if the project corpora and its files were updated; otherwise, <c>false</c>.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <remarks>
    /// Notes:
    ///  - If the corpus was updated, then you should start the Build with <see cref="BuildProjectAsync"/>.
    ///  - If the Serval feature flag is disabled, false is returned and an information message logged.
    ///  - If a corpus is not configured on Serval, one is created and recorded in the project secret.
    /// </remarks>
    public async Task<bool> SyncProjectCorporaAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Used to return whether or not the corpus was updated
        bool corpusUpdated = false;

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
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
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have serval data
        if (projectSecret.ServalData is null)
        {
            throw new DataNotFoundException("The Serval data cannot be found.");
        }

        // Ensure we have a translation engine ID
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine ID cannot be found.");
        }

        // See if there is a corpus
        string? corpusId = projectSecret.ServalData.Corpora
            .FirstOrDefault(c => c.Value.PreTranslate == preTranslate)
            .Key;

        // Get the files we have already synced
        var oldSourceCorpusFiles = new List<ServalCorpusFile>();
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldSourceCorpusFiles = projectSecret.ServalData.Corpora[corpusId].SourceFiles;
        }

        // Reuse the SFTextCorpusFactory implementation
        ITextCorpus? textCorpus = await _textCorpusFactory.CreateAsync(
            new[] { sfProjectId },
            TextCorpusType.Source,
            preTranslate
        );
        var newSourceCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
            includeBlankSegments: false,
            textCorpus,
            oldSourceCorpusFiles,
            newSourceCorpusFiles,
            cancellationToken
        );

        // Get the files we have already synced
        var oldTargetCorpusFiles = new List<ServalCorpusFile>();
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldTargetCorpusFiles = projectSecret.ServalData.Corpora[corpusId].TargetFiles;
        }

        textCorpus = await _textCorpusFactory.CreateAsync(new[] { sfProjectId }, TextCorpusType.Target, preTranslate);
        List<ServalCorpusFile> newTargetCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
            preTranslate,
            textCorpus,
            oldTargetCorpusFiles,
            newTargetCorpusFiles,
            cancellationToken
        );

        // If the corpus should be updated
        if (corpusUpdated)
        {
            // Create or update the corpus
            TranslationCorpus corpus;
            TranslationCorpusConfig corpusConfig = new TranslationCorpusConfig
            {
                Name = sfProjectId,
                SourceFiles = newSourceCorpusFiles
                    .Select(f => new TranslationCorpusFileConfig { FileId = f.FileId, TextId = f.TextId })
                    .ToList(),
                SourceLanguage = project.TranslateConfig.Source.WritingSystem.Tag,
                TargetFiles = newTargetCorpusFiles
                    .Select(f => new TranslationCorpusFileConfig { FileId = f.FileId, TextId = f.TextId })
                    .ToList(),
                TargetLanguage = project.WritingSystem.Tag,
            };
            if (string.IsNullOrEmpty(corpusId))
            {
                corpus = await _translationEnginesClient.AddCorpusAsync(
                    translationEngineId,
                    corpusConfig,
                    cancellationToken
                );
            }
            else
            {
                TranslationCorpusUpdateConfig corpusUpdateConfig = new TranslationCorpusUpdateConfig
                {
                    SourceFiles = corpusConfig.SourceFiles,
                    TargetFiles = corpusConfig.TargetFiles,
                };
                corpus = await _translationEnginesClient.UpdateCorpusAsync(
                    translationEngineId,
                    corpusId,
                    corpusUpdateConfig,
                    cancellationToken
                );
            }

            // Update the project secret with the new corpus information
            await _projectSecrets.UpdateAsync(
                sfProjectId,
                u =>
                    u.Set(
                        p => p.ServalData.Corpora[corpus.Id],
                        new ServalCorpus
                        {
                            SourceFiles = newSourceCorpusFiles,
                            TargetFiles = newTargetCorpusFiles,
                            PreTranslate = preTranslate,
                        }
                    )
            );
        }

        return corpusUpdated;
    }

    /// <summary>
    /// Gets the segments from the text with Unix/Linux line endings.
    /// </summary>
    /// <param name="text">The IText</param>
    /// <param name="includeBlankSegments">
    /// <c>true</c> if we are to include blank segments (usually for a pre-translation target); otherwise <c>false</c>.
    /// </param>
    /// <returns>The text file data to be uploaded to Serval.</returns>
    private static string GetTextFileData(IText text, bool includeBlankSegments)
    {
        var sb = new StringBuilder();

        // For pre-translation, we must upload empty lines with segment refs for the correct references to be returned
        foreach (TextSegment segment in text.GetSegments().Where(s => !s.IsEmpty || includeBlankSegments))
        {
            // We pad the verse number so the string based key comparisons in Machine will be accurate.
            // If the int does not parse successfully, it will be because it is a Biblical Term - which has a Greek or
            // Hebrew word as the key, or because the verse number is unusual (i.e. 12a or 12-13). Usually the key is
            // a standard verse number, so will be at most in the hundreds.
            string key = segment.SegmentRef is TextSegmentRef textSegmentRef
                ? string.Join('_', textSegmentRef.Keys.Select(k => int.TryParse(k, out int _) ? k.PadLeft(3, '0') : k))
                : (string)segment.SegmentRef;

            // Strip characters from the key that will corrupt the line
            sb.Append(key.Replace('\n', '_').Replace('\t', '_'));
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

            // Append the Unix EOL to ensure consistency as this text data is uploaded to Serval
            sb.Append('\n');
        }

        return sb.ToString();
    }

    /// <summary>
    /// Gets the TranslationBuildConfig for the specified ServalData object.
    /// </summary>
    /// <param name="servalData">The Serval data.</param>
    /// <returns>The TranslationBuildConfig for a Pre-Translate build.</returns>
    /// <remarks>Do not use with SMT builds.</remarks>
    private static TranslationBuildConfig GetTranslationBuildConfig(ServalData servalData) =>
        new TranslationBuildConfig
        {
            Pretranslate = servalData.Corpora
                .Where(s => s.Value.PreTranslate)
                .Select(c => new PretranslateCorpusConfig { CorpusId = c.Key })
                .ToList(),
        };

    /// <summary>
    /// Creates a project in Serval.
    /// </summary>
    /// <param name="sfProject">The Scripture Forge project</param>
    /// <param name="preTranslate">The project is for pre-translation.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">The translation engine could not be created.</exception>
    private async Task<SFProjectSecret> CreateServalProjectAsync(
        SFProject sfProject,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Get the existing project secret, so we can see how to create the engine and update the Serval data
        SFProjectSecret projectSecret = await _projectSecrets.GetAsync(sfProject.Id);
        if (
            (string.IsNullOrWhiteSpace(projectSecret.ServalData?.PreTranslationEngineId) && preTranslate)
            || (string.IsNullOrWhiteSpace(projectSecret.ServalData?.TranslationEngineId) && !preTranslate)
        )
        {
            TranslationEngineConfig engineConfig = new TranslationEngineConfig
            {
                Name = sfProject.Id,
                SourceLanguage = sfProject.TranslateConfig.Source.WritingSystem.Tag,
                TargetLanguage = sfProject.WritingSystem.Tag,
                Type = preTranslate ? "Nmt" : "SmtTransfer",
            };
            // Add the project to Serval
            TranslationEngine translationEngine = await _translationEnginesClient.CreateAsync(
                engineConfig,
                cancellationToken
            );
            if (string.IsNullOrWhiteSpace(translationEngine.Id))
            {
                throw new DataNotFoundException("Translation Engine ID from Serval is missing.");
            }

            if (projectSecret.ServalData is not null && preTranslate)
            {
                // Store the Pre-Translation Engine ID
                projectSecret = await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.PreTranslationEngineId, translationEngine.Id)
                );
            }
            else if (projectSecret.ServalData is not null)
            {
                // Store the Translation Engine ID
                projectSecret = await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.TranslationEngineId, translationEngine.Id)
                );
            }
            else if (preTranslate)
            {
                // Store the Pre-Translation Engine ID
                projectSecret = await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { PreTranslationEngineId = translationEngine.Id })
                );
            }
            else
            {
                // Store the Translation Engine ID
                projectSecret = await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = translationEngine.Id })
                );
            }
        }

        return projectSecret;
    }

    /// <summary>
    /// Determines if a pre-translation build is queued.
    /// </summary>
    /// <param name="translationEngineId">The translation engine id</param>
    /// <returns><c>true</c> if the pre-translation build is running; otherwise, <c>false</c>.</returns>
    private async Task<bool> PreTranslationBuildQueuedAsync(string translationEngineId)
    {
        bool buildRunning;
        try
        {
            TranslationBuild translationBuild = await _translationEnginesClient.GetCurrentBuildAsync(
                translationEngineId
            );
            buildRunning = translationBuild.Pretranslate is not null && translationBuild.Pretranslate.Any();
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status204NoContent)
        {
            // A 204 error means no build is running
            buildRunning = false;
        }

        return buildRunning;
    }

    /// <summary>
    /// Syncs an <see cref="ITextCorpus"/> to Serval, creating files on Serval as necessary.
    /// </summary>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="includeBlankSegments">
    /// <c>true</c> if we are to include blank segments (usually for a pre-translation target); otherwise <c>false</c>.
    /// </param>
    /// <param name="textCorpus">The text corpus created by <see cref="SFTextCorpusFactory"/>.</param>
    /// <param name="oldCorpusFiles">The existing corpus files (optional).</param>
    /// <param name="newCorpusFiles">The updated list of corpus files.</param>
    /// <param name="cancellationToken"></param>
    /// <returns><c>true</c> if the corpus was created or updated; otherwise, <c>false</c>.</returns>
    /// <remarks>
    /// The project secret is updated with the corpus file details added to or removed from Serval.
    /// </remarks>
    private async Task<bool> UploadNewCorpusFilesAsync(
        string projectId,
        bool includeBlankSegments,
        ITextCorpus? textCorpus,
        ICollection<ServalCorpusFile>? oldCorpusFiles,
        ICollection<ServalCorpusFile> newCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        // Used to return whether or not the corpus files were created or updated
        bool corpusUpdated = false;

        // Sync each text
        foreach (IText text in textCorpus?.Texts ?? Array.Empty<IText>())
        {
            string textFileData = GetTextFileData(text, includeBlankSegments);
            if (!string.IsNullOrWhiteSpace(textFileData))
            {
                // Remove the project id from the start of the text id (if present)
                string textId = text.Id.StartsWith($"{projectId}_") ? text.Id[(projectId.Length + 1)..] : text.Id;

                // See if the corpus exists and update it if it is missing, or if the checksum has changed
                bool uploadText = false;
                string checksum = StringUtils.ComputeMd5Hash(textFileData);
                ServalCorpusFile? previousCorpusFile = oldCorpusFiles?.FirstOrDefault(c => c.TextId == textId);
                if (previousCorpusFile is null || previousCorpusFile.FileChecksum != checksum)
                {
                    uploadText = true;
                }

                // Upload the file if it is not there or has changed
                if (uploadText)
                {
                    await using MemoryStream data = new MemoryStream(Encoding.UTF8.GetBytes(textFileData));
                    DataFile dataFile = previousCorpusFile is null
                        ? await _dataFilesClient.CreateAsync(
                            new FileParameter(data),
                            FileFormat.Text,
                            textId,
                            cancellationToken
                        )
                        : await _dataFilesClient.UpdateAsync(
                            previousCorpusFile.FileId,
                            new FileParameter(data),
                            cancellationToken
                        );

                    newCorpusFiles.Add(
                        new ServalCorpusFile
                        {
                            FileChecksum = checksum,
                            FileId = dataFile.Id,
                            TextId = textId,
                        }
                    );

                    corpusUpdated = true;
                }
                else
                {
                    newCorpusFiles.Add(previousCorpusFile);
                }
            }
        }

        // Delete corpus files for removed texts
        if (oldCorpusFiles is not null)
        {
            foreach (var corpusFile in oldCorpusFiles.Where(c => newCorpusFiles.All(n => n.FileId != c.FileId)))
            {
                try
                {
                    await _dataFilesClient.DeleteAsync(corpusFile.FileId, cancellationToken);
                }
                catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
                {
                    // If the file was already deleted, just log a message
                    string message =
                        $"Corpora file {corpusFile.FileId} for text {corpusFile.TextId} in project {projectId}"
                        + " was missing or already deleted.";
                    _logger.LogInformation(e, message);
                }

                corpusUpdated = true;
            }
        }

        return corpusUpdated;
    }
}
