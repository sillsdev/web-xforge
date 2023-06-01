using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
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
    private readonly ITextCorpusFactory _textCorpusFactory;
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
        ITextCorpusFactory textCorpusFactory,
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

    public async Task AddProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
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
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
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
            await CreateServalProjectAsync(project, cancellationToken);
        }
    }

    public async Task BuildProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
    {
        // Build the project with the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            await _engineService.StartBuildByProjectIdAsync(sfProjectId);
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
            throw new ArgumentException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id
        if (string.IsNullOrWhiteSpace(projectSecret.ServalData?.TranslationEngineId))
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

            // Create the Serval project
            // The returned project secret will have the translation engine id
            projectSecret = await CreateServalProjectAsync(projectDoc.Data, cancellationToken);
        }

        // Sync the corpus
        if (await SyncProjectCorporaAsync(curUserId, sfProjectId, cancellationToken))
        {
            // If the corpus was updated, start the build
            // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that
            await _translationEnginesClient.StartBuildAsync(
                projectSecret.ServalData!.TranslationEngineId,
                new TranslationBuildConfig(),
                cancellationToken
            );
        }
    }

    public async Task RemoveProjectAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
    {
        // Remove the project from the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
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
            throw new ArgumentException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id
        if (string.IsNullOrWhiteSpace(projectSecret.ServalData?.TranslationEngineId))
        {
            _logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
            return;
        }

        // Remove the corpus files
        foreach ((string corpusId, _) in projectSecret.ServalData.Corpora)
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
                    if (e.StatusCode == (int)HttpStatusCode.NotFound)
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
            string translationEngineId = projectSecret.ServalData.TranslationEngineId;
            try
            {
                await _translationEnginesClient.DeleteCorpusAsync(translationEngineId, corpusId, cancellationToken);
            }
            catch (ServalApiException e)
            {
                // A 404 means that the translation engine does not exist
                string message;
                if (e.StatusCode == (int)HttpStatusCode.NotFound)
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
        }

        // Remove the project from Serval
        await _translationEnginesClient.DeleteAsync(projectSecret.ServalData.TranslationEngineId, cancellationToken);

        // Remove the Serval Data
        await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData));
    }

    /// <summary>
    /// Syncs the project corpora from MongoDB to Serval via <see cref="SFTextCorpusFactory"/>
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId">The project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns><c>true</c> if the project corpora and its files were updated; otherwise, <c>false</c>.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ArgumentException">One of the arguments was an invalid identifier.</exception>
    /// <remarks>
    /// Notes:
    ///  - If the corpus was updated, then you should start the Build with <see cref="BuildProjectAsync"/>.
    ///  - If the Serval feature flag is disabled, false is returned and an information message logged.
    ///  - If a corpus is not configured on Serval, one is created and recorded in the project secret.
    /// </remarks>
    public async Task<bool> SyncProjectCorporaAsync(
        string curUserId,
        string sfProjectId,
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
            throw new ArgumentException("The project secret cannot be found.");
        }

        // Ensure we have serval data
        if (projectSecret.ServalData is null)
        {
            throw new ArgumentException("The Serval data cannot be found.");
        }

        // Ensure we have a translation engine ID
        if (string.IsNullOrWhiteSpace(projectSecret.ServalData?.TranslationEngineId))
        {
            throw new ArgumentException("The translation engine ID cannot be found.");
        }

        // See if there is a corpus
        string? corpusId = projectSecret.ServalData.Corpora.Keys.FirstOrDefault();

        // Get the files we have already synced
        var oldSourceCorpusFiles = new List<ServalCorpusFile>();
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldSourceCorpusFiles = projectSecret.ServalData.Corpora[corpusId].SourceFiles;
        }

        // Reuse the SFTextCorpusFactory implementation
        ITextCorpus? textCorpus = await _textCorpusFactory.CreateAsync(new[] { sfProjectId }, TextCorpusType.Source);
        var newSourceCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
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

        textCorpus = await _textCorpusFactory.CreateAsync(new[] { sfProjectId }, TextCorpusType.Target);
        List<ServalCorpusFile> newTargetCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
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
                    projectSecret.ServalData.TranslationEngineId,
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
                    projectSecret.ServalData.TranslationEngineId,
                    corpusId,
                    corpusUpdateConfig,
                    cancellationToken
                );
            }

            // Update the project secret with the new corpus information
            await _projectSecrets.UpdateAsync(
                sfProjectId,
                u =>
                {
                    if (!string.IsNullOrWhiteSpace(corpusId))
                    {
                        u.Unset(p => p.ServalData.Corpora[corpusId]);
                    }
                    u.Set(
                        p => p.ServalData.Corpora[corpus.Id],
                        new ServalCorpus { SourceFiles = newSourceCorpusFiles, TargetFiles = newTargetCorpusFiles }
                    );
                }
            );
        }

        return corpusUpdated;
    }

    /// <summary>
    /// Gets the segments from the text with Unix/Linux line endings.
    /// </summary>
    /// <param name="text">The IText</param>
    /// <returns>The text file data to be uploaded to Serval.</returns>
    private static string GetTextFileData(IText text)
    {
        var sb = new StringBuilder();
        foreach (TextSegment segment in text.GetSegments().Where(s => !s.IsEmpty))
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
    /// Creates a project in Serval.
    /// </summary>
    /// <param name="sfProject">The Scripture Forge project</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="ArgumentException">The translation engine could not be created.</exception>
    private async Task<SFProjectSecret> CreateServalProjectAsync(
        SFProject sfProject,
        CancellationToken cancellationToken
    )
    {
        TranslationEngineConfig engineConfig = new TranslationEngineConfig
        {
            Name = sfProject.Id,
            SourceLanguage = sfProject.TranslateConfig.Source.WritingSystem.Tag,
            TargetLanguage = sfProject.WritingSystem.Tag,
            Type = "SmtTransfer",
        };
        // Add the project to Serval
        TranslationEngine translationEngine = await _translationEnginesClient.CreateAsync(
            engineConfig,
            cancellationToken
        );
        if (string.IsNullOrWhiteSpace(translationEngine.Id))
        {
            throw new ArgumentException("Translation Engine ID from Serval is missing.");
        }

        // Store the Translation Engine ID
        return await _projectSecrets.UpdateAsync(
            sfProject.Id,
            u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = translationEngine.Id })
        );
    }

    /// <summary>
    /// Syncs an <see cref="ITextCorpus"/> to Serval, creating files on Serval as necessary.
    /// </summary>
    /// <param name="projectId">The project identifier.</param>
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
            string textFileData = GetTextFileData(text);
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
                await _dataFilesClient.DeleteAsync(corpusFile.FileId, cancellationToken);
                corpusUpdated = true;
            }
        }

        return corpusUpdated;
    }
}
