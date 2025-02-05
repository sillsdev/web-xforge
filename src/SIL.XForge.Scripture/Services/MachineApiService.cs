using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Machine API service for use with <see cref="Controllers.MachineApiController"/>.
/// </summary>
public class MachineApiService(
    IBackgroundJobClient backgroundJobClient,
    IExceptionHandler exceptionHandler,
    ILogger<MachineApiService> logger,
    IMachineProjectService machineProjectService,
    IParatextService paratextService,
    IPreTranslationService preTranslationService,
    IRepository<SFProjectSecret> projectSecrets,
    ISFProjectService projectService,
    IRealtimeService realtimeService,
    IOptions<ServalOptions> servalOptions,
    ISyncService syncService,
    ITranslationEnginesClient translationEnginesClient,
    ITranslationEngineTypesClient translationEngineTypesClient,
    IRepository<UserSecret> userSecrets
) : IMachineApiService
{
    /// <summary>
    /// The Faulted build state.
    /// </summary>
    /// <remarks>
    /// NOTE: Serval returns states in TitleCase, while the frontend requires uppercase.
    /// </remarks>
    internal const string BuildStateFaulted = "FAULTED";

    /// <summary>
    /// The Queued build state.
    /// </summary>
    /// <remarks>
    /// SF returns this state while the files are being uploaded to Serval.
    /// </remarks>
    internal const string BuildStateQueued = "QUEUED";
    private static readonly IEqualityComparer<IList<int>> _listIntComparer = SequenceEqualityComparer.Create(
        EqualityComparer<int>.Default
    );
    private static readonly IEqualityComparer<IList<string>> _listStringComparer = SequenceEqualityComparer.Create(
        EqualityComparer<string>.Default
    );
    private static readonly IEqualityComparer<IList<ProjectScriptureRange>> _listProjectScriptureRangeComparer =
        SequenceEqualityComparer.Create(EqualityComparer<ProjectScriptureRange>.Default);

    public async Task CancelPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // If we have pre-translation job information
        if (
            (await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret)
            && (
                projectSecret.ServalData?.PreTranslationJobId is not null
                || projectSecret.ServalData?.PreTranslationQueuedAt is not null
            )
        )
        {
            // Cancel the Hangfire job
            if (projectSecret.ServalData?.PreTranslationJobId is not null)
            {
                backgroundJobClient.Delete(projectSecret.ServalData?.PreTranslationJobId);
            }

            // Clear the pre-translation queued status and job id
            await projectSecrets.UpdateAsync(
                sfProjectId,
                u =>
                {
                    u.Unset(p => p.ServalData.PreTranslationJobId);
                    u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                }
            );
        }

        // Get the translation engine id
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);

        try
        {
            // Cancel the build on Serval
            await translationEnginesClient.CancelBuildAsync(translationEngineId, cancellationToken);
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // We do not mind if a 404 exception comes from Serval - we can assume the job is now cancelled
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }
    }

    public async Task ExecuteWebhookAsync(string json, string signature)
    {
        // Generate a signature for the JSON
        using HMACSHA256 hmacHasher = new HMACSHA256(Encoding.UTF8.GetBytes(servalOptions.Value.WebhookSecret));
        byte[] hash = hmacHasher.ComputeHash(Encoding.UTF8.GetBytes(json));
        string calculatedSignature = $"sha256={Convert.ToHexString(hash)}";

        // Ensure that the signatures match
        if (signature != calculatedSignature)
        {
            throw new ArgumentException(@"Signatures do not match", nameof(signature));
        }

        // Get the translation id from the JSON
        var anonymousType = new
        {
            Event = string.Empty,
            Payload = new
            {
                Build = new { Id = string.Empty },
                Engine = new { Id = string.Empty },
                BuildState = string.Empty,
            },
        };
        var delivery = JsonConvert.DeserializeAnonymousType(json, anonymousType);

        // We only support translation build finished events for completed builds
        if (
            delivery.Event != nameof(WebhookEvent.TranslationBuildFinished)
            || delivery.Payload.BuildState != nameof(JobState.Completed)
        )
        {
            return;
        }

        // Retrieve the translation engine id from the delivery
        string translationEngineId = delivery.Payload?.Engine?.Id;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("A translation engine id could not be retrieved from the webhook");
        }

        // Get the project id from the project secret
        string? projectId = await projectSecrets
            .Query()
            .Where(p => p.ServalData.PreTranslationEngineId == translationEngineId)
            .Select(p => p.Id)
            .FirstOrDefaultAsync();

        // Ensure we have a project id
        if (string.IsNullOrWhiteSpace(projectId))
        {
            // Log the error in the console. We do not need to throw it, as the engine will be for another SF environment
            logger.LogWarning(
                "A project id could not be found for translation engine id {translationEngineId}",
                translationEngineId
            );
            return;
        }

        // Run the background job
        backgroundJobClient.Enqueue<MachineApiService>(r =>
            r.RetrievePreTranslationStatusAsync(projectId, CancellationToken.None)
        );
    }

    public async Task<ServalBuildDto?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission, if they are not a Serval administrator
        if (!isServalAdmin)
        {
            await EnsureProjectPermissionAsync(curUserId, sfProjectId);
        }

        // Execute on Serval, if it is enabled
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);

        try
        {
            TranslationBuild translationBuild = await translationEnginesClient.GetBuildAsync(
                translationEngineId,
                buildId,
                minRevision,
                cancellationToken
            );
            buildDto = CreateDto(translationBuild);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            buildDto = UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<ServalBuildDto?> GetLastCompletedPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission, if they are not a Serval administrator
        if (!isServalAdmin)
        {
            await EnsureProjectPermissionAsync(curUserId, sfProjectId);
        }

        // Get the translation engine
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);

        try
        {
            // Get the last completed build
            TranslationBuild? translationBuild = (
                await translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)
            )
                .Where(b => b.State == JobState.Completed)
                .MaxBy(b => b.DateFinished);
            if (translationBuild is not null)
            {
                buildDto = CreateDto(translationBuild);
            }
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            buildDto = UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<ServalBuildDto?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission, if they are not a Serval administrator
        if (!isServalAdmin)
        {
            await EnsureProjectPermissionAsync(curUserId, sfProjectId);
        }

        // Otherwise execute on Serval, if it is enabled
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);

        try
        {
            TranslationBuild translationBuild;
            try
            {
                translationBuild = await translationEnginesClient.GetCurrentBuildAsync(
                    translationEngineId,
                    minRevision,
                    cancellationToken
                );
            }
            catch (ServalApiException e) when (preTranslate && e.StatusCode == StatusCodes.Status204NoContent)
            {
                // This is the expected result if there is no current build.
                // If there is no pre-translation build, just get the latest one.
                translationBuild =
                    (await translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)).MaxBy(
                        b => b.DateFinished
                    ) ?? throw new DataNotFoundException("Entity Deleted");
            }

            buildDto = CreateDto(translationBuild);
            buildDto = UpdateDto(buildDto, sfProjectId);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        return buildDto;
    }

    public async Task<ServalEngineDto> GetEngineAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);

        try
        {
            TranslationEngine translationEngine = await translationEnginesClient.GetAsync(
                translationEngineId,
                cancellationToken
            );
            ServalEngineDto engineDto = CreateDto(translationEngine);

            // Make sure the DTO conforms to the machine-api V2 URLs
            return UpdateDto(engineDto, sfProjectId);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<PreTranslationDto> GetPreTranslationAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Create the DTO to return
        PreTranslationDto preTranslation = new PreTranslationDto();

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        try
        {
            preTranslation.PreTranslations = await preTranslationService.GetPreTranslationsAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        return preTranslation;
    }

    public async Task<Snapshot<TextData>> GetPreTranslationDeltaAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Do not allow retrieving the entire book as a delta
        if (chapterNum == 0)
        {
            throw new DataNotFoundException("Chapter not specified");
        }

        try
        {
            string usfm = await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
            return new Snapshot<TextData>
            {
                Id = TextData.GetTextDocId(sfProjectId, bookNum, chapterNum),
                Version = 0,
                Data = new TextData(await paratextService.GetDeltaFromUsfmAsync(curUserId, sfProjectId, usfm, bookNum)),
            };
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    /// <summary>
    /// Retrieves the state of an NMT or SMT build before the build is started on Serval.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="preTranslate">If <c>true</c>, check the status of the NMT/Pre-Translation build.</param>
    /// <param name="isServalAdmin">If <c>true</c>, the user is a Serval administrator.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>
    /// A <see cref="ServalBuildDto"/> if the build is being uploaded to Serval; otherwise, <c>null</c>.
    /// </returns>
    public async Task<ServalBuildDto?> GetQueuedStateAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission, if they are not a Serval administrator
        if (!isServalAdmin)
        {
            await EnsureProjectPermissionAsync(curUserId, sfProjectId);
        }

        // If there is a job queued, return a build dto with a status showing it is queued
        if (
            (await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret)
            && projectSecret.ServalData is not null
        )
        {
            // Get the values to use depending on whether this is a pre-translation job or not
            string? engineId = preTranslate
                ? projectSecret.ServalData.PreTranslationEngineId
                : projectSecret.ServalData.TranslationEngineId;
            string? errorMessage = preTranslate
                ? projectSecret.ServalData.PreTranslationErrorMessage
                : projectSecret.ServalData.TranslationErrorMessage;
            DateTime? queuedAt = preTranslate
                ? projectSecret.ServalData.PreTranslationQueuedAt
                : projectSecret.ServalData.TranslationQueuedAt;

            // If we have an error message, report that to the user
            if (!string.IsNullOrWhiteSpace(errorMessage))
            {
                buildDto = new ServalBuildDto
                {
                    State = BuildStateFaulted,
                    Message = errorMessage,
                    AdditionalInfo = new ServalBuildAdditionalInfo { TranslationEngineId = engineId ?? string.Empty },
                };
            }
            else
            {
                // If we do not have build queued, do not return a build dto
                if (queuedAt is null)
                {
                    return null;
                }

                // If the build was queued 6 hours or more ago, it will have failed to upload
                if (queuedAt <= DateTime.UtcNow.AddHours(-6))
                {
                    buildDto = new ServalBuildDto
                    {
                        State = BuildStateFaulted,
                        Message = "The build failed to upload to the server.",
                        AdditionalInfo = new ServalBuildAdditionalInfo
                        {
                            TranslationEngineId = engineId ?? string.Empty,
                        },
                    };
                }
                else
                {
                    // The build is queued and uploading is occurring in the background
                    buildDto = new ServalBuildDto
                    {
                        State = BuildStateQueued,
                        Message = "The build is being uploaded to the server.",
                        AdditionalInfo = new ServalBuildAdditionalInfo
                        {
                            TranslationEngineId = engineId ?? string.Empty,
                        },
                    };
                }
            }
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            buildDto = UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<string> GetPreTranslationUsfmAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission, if they are not a Serval administrator
        if (!isServalAdmin)
        {
            await EnsureProjectPermissionAsync(curUserId, sfProjectId);
        }

        try
        {
            return await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<Usj> GetPreTranslationUsjAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Retrieve the user secret
        Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(curUserId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user does not exist.");
        }

        try
        {
            string usfm = await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
            string usx = paratextService.GetBookText(userSecret, project.ParatextId, bookNum, usfm);
            return UsxToUsj.UsxStringToUsj(usx);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<string> GetPreTranslationUsxAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Retrieve the user secret
        Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(curUserId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user does not exist.");
        }

        try
        {
            string usfm = await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
            return paratextService.GetBookText(userSecret, project.ParatextId, bookNum, usfm);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            return await translationEnginesClient.GetWordGraphAsync(translationEngineId, segment, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<LanguageDto> IsLanguageSupportedAsync(string languageCode, CancellationToken cancellationToken)
    {
        string engineType = await machineProjectService.GetTranslationEngineTypeAsync(preTranslate: true);
        LanguageInfo languageInfo = await translationEngineTypesClient.GetLanguageInfoAsync(
            engineType,
            languageCode,
            cancellationToken
        );
        return new LanguageDto
        {
            LanguageCode = languageInfo.InternalCode ?? languageCode,
            IsSupported = languageInfo.IsNative,
        };
    }

    [Mutex]
    public async Task RetrievePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken)
    {
        try
        {
            // Record the SF Project id to help with debugging
            exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "sfProjectId", sfProjectId } }
            );

            // Get the project secret to see if this is being run from another process
            if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new DataNotFoundException("The project secret does not exist.");
            }

            // Ensure that the flag is unset or successfully set previously.
            // False means another process is running this function.
            if (projectSecret.ServalData?.PreTranslationsRetrieved ?? true)
            {
                // Set the retrieved flag as in progress
                await projectSecrets.UpdateAsync(
                    sfProjectId,
                    u => u.Set(p => p.ServalData.PreTranslationsRetrieved, false)
                );

                // Get the pre-translations
                await preTranslationService.UpdatePreTranslationStatusAsync(sfProjectId, cancellationToken);

                // Set the retrieved flag as complete
                await projectSecrets.UpdateAsync(
                    sfProjectId,
                    u => u.Set(p => p.ServalData.PreTranslationsRetrieved, true)
                );
            }
        }
        catch (TaskCanceledException e) when (e.InnerException is not TimeoutException)
        {
            // Do not log error - the job was cancelled
            // Exclude TaskCanceledException with an inner TimeoutException, as this generated by an HttpClient timeout

            // Ensure that the retrieved flag is cleared
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationsRetrieved));
        }
        catch (Exception e)
        {
            // Log the error and report to bugsnag
            string message =
                $"Retrieve pre-translation status exception occurred for project {sfProjectId} running in background job.";
            logger.LogError(e, message);
            exceptionHandler.ReportException(e);

            // Ensure that the retrieved flag is cleared
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationsRetrieved));
        }
    }

    public async Task StartBuildAsync(string curUserId, string sfProjectId, CancellationToken cancellationToken)
    {
        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the user has permission on the project
        MachineApi.EnsureProjectPermission(curUserId, projectDoc.Data);

        // Sync the source and target before running the build
        // We use project service, as it provides permission and token checks
        string syncJobId = await projectService.SyncAsync(curUserId, sfProjectId);

        // Run the training after the sync has completed. If the sync failed or stopped, retrain anyway
        string buildJobId = backgroundJobClient.ContinueJobWith<MachineProjectService>(
            syncJobId,
            r =>
                r.BuildProjectForBackgroundJobAsync(
                    curUserId,
                    new BuildConfig { ProjectId = sfProjectId },
                    false,
                    CancellationToken.None
                ),
            null,
            JobContinuationOptions.OnAnyFinishedState
        );

        // Set the translation queued date and time, and hang fire job id
        await projectSecrets.UpdateAsync(
            sfProjectId,
            u =>
            {
                u.Set(p => p.ServalData.TranslationJobId, buildJobId);
                u.Set(p => p.ServalData.TranslationQueuedAt, DateTime.UtcNow);
                u.Unset(p => p.ServalData.TranslationErrorMessage);
            }
        );
    }

    public async Task StartPreTranslationBuildAsync(
        string curUserId,
        BuildConfig buildConfig,
        CancellationToken cancellationToken
    )
    {
        // Ensure that there are no errors in the build configuration for training
        if (!string.IsNullOrWhiteSpace(buildConfig.TrainingScriptureRange) && buildConfig.TrainingBooks.Count > 0)
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TrainingScriptureRange)}"
                    + $" and {nameof(buildConfig.TrainingBooks)}."
            );
        }

        if (
            !string.IsNullOrWhiteSpace(buildConfig.TrainingScriptureRange)
            && buildConfig.TrainingScriptureRanges.Count > 0
        )
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TrainingScriptureRange)}"
                    + $" and {nameof(buildConfig.TrainingScriptureRanges)}."
            );
        }

        if (buildConfig.TrainingScriptureRanges.Count > 0 && buildConfig.TrainingBooks.Count > 0)
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TrainingScriptureRanges)}"
                    + $" and {nameof(buildConfig.TrainingBooks)}."
            );
        }

        // Ensure that there are no errors in the build configuration for translation
        if (!string.IsNullOrWhiteSpace(buildConfig.TranslationScriptureRange) && buildConfig.TranslationBooks.Count > 0)
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TranslationScriptureRange)}"
                    + $" and {nameof(buildConfig.TranslationBooks)}."
            );
        }

        if (
            !string.IsNullOrWhiteSpace(buildConfig.TranslationScriptureRange)
            && buildConfig.TranslationScriptureRanges.Count > 0
        )
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TranslationScriptureRange)}"
                    + $" and {nameof(buildConfig.TranslationScriptureRanges)}."
            );
        }

        if (buildConfig.TranslationScriptureRanges.Count > 0 && buildConfig.TranslationBooks.Count > 0)
        {
            throw new DataNotFoundException(
                $"You cannot specify both {nameof(buildConfig.TranslationScriptureRanges)}"
                    + $" and {nameof(buildConfig.TranslationBooks)}."
            );
        }

        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(buildConfig.ProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the user has permission on the project
        MachineApi.EnsureProjectPermission(curUserId, projectDoc.Data);

        // Save the selected books
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingBooks,
                [.. buildConfig.TrainingBooks],
                _listIntComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles,
                [.. buildConfig.TrainingDataFiles],
                _listStringComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRange,
                buildConfig.TrainingScriptureRange
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingScriptureRanges,
                [.. buildConfig.TrainingScriptureRanges],
                _listProjectScriptureRangeComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTranslationBooks,
                [.. buildConfig.TranslationBooks],
                _listIntComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRange,
                buildConfig.TranslationScriptureRange
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTranslationScriptureRanges,
                [.. buildConfig.TranslationScriptureRanges],
                _listProjectScriptureRangeComparer
            );
            if (!projectDoc.Data.TranslateConfig.PreTranslate)
            {
                op.Set(p => p.TranslateConfig.PreTranslate, true);
            }
        });

        // Sync the source and target before running the build
        // We use project service, as it provides permission and token checks
        string jobId = await projectService.SyncAsync(curUserId, buildConfig.ProjectId);

        // If we have an alternate source, sync that first
        string alternateSourceProjectId = projectDoc.Data.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef;
        if (
            projectDoc.Data.TranslateConfig.DraftConfig.AlternateSourceEnabled
            && !string.IsNullOrWhiteSpace(alternateSourceProjectId)
        )
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = alternateSourceProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // If we have an alternate training source, sync that next
        string alternateTrainingSourceProjectId = projectDoc
            .Data
            .TranslateConfig
            .DraftConfig
            .AlternateTrainingSource
            ?.ProjectRef;
        if (
            projectDoc.Data.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled
            && !string.IsNullOrWhiteSpace(alternateTrainingSourceProjectId)
        )
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = alternateTrainingSourceProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // If we have an additional training source, sync that next
        string additionalTrainingSourceProjectId = projectDoc
            .Data
            .TranslateConfig
            .DraftConfig
            .AdditionalTrainingSource
            ?.ProjectRef;
        if (
            projectDoc.Data.TranslateConfig.DraftConfig.AdditionalTrainingSourceEnabled
            && !string.IsNullOrWhiteSpace(additionalTrainingSourceProjectId)
        )
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = additionalTrainingSourceProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // Run the training after the sync has completed
        jobId = backgroundJobClient.ContinueJobWith<MachineProjectService>(
            jobId,
            r => r.BuildProjectForBackgroundJobAsync(curUserId, buildConfig, true, CancellationToken.None)
        );

        // Set the pre-translation queued date and time, and hang fire job id
        await projectSecrets.UpdateAsync(
            buildConfig.ProjectId,
            u =>
            {
                u.Set(p => p.ServalData.PreTranslationJobId, jobId);
                u.Set(p => p.ServalData.PreTranslationQueuedAt, DateTime.UtcNow);
                u.Unset(p => p.ServalData.PreTranslationErrorMessage);
            }
        );
    }

    public async Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            await translationEnginesClient.TrainSegmentAsync(translationEngineId, segmentPair, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }
    }

    public async Task<TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            return await translationEnginesClient.TranslateAsync(translationEngineId, segment, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<TranslationResult[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        string segment,
        CancellationToken cancellationToken
    )
    {
        IEnumerable<TranslationResult> translationResults = Array.Empty<TranslationResult>();

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        if (!string.IsNullOrWhiteSpace(translationEngineId))
        {
            try
            {
                translationResults = await translationEnginesClient.TranslateNAsync(
                    translationEngineId,
                    n,
                    segment,
                    cancellationToken
                );
            }
            catch (ServalApiException e)
            {
                ProcessServalApiException(e);
            }
        }

        return [.. translationResults];
    }

    /// <summary>
    /// Creates the Build DTO for the front end.
    /// </summary>
    /// <param name="translationBuild">The translation build from Serval.</param>
    /// <returns>The build DTO.</returns>
    private static ServalBuildDto CreateDto(TranslationBuild translationBuild) =>
        new ServalBuildDto
        {
            Id = translationBuild.Id,
            Revision = translationBuild.Revision,
            PercentCompleted = translationBuild.PercentCompleted ?? 0.0,
            Message = translationBuild.Message,
            QueueDepth = translationBuild.QueueDepth ?? 0,
            State = translationBuild.State.ToString().ToUpperInvariant(),
            AdditionalInfo = new ServalBuildAdditionalInfo
            {
                BuildId = translationBuild.Id,
                CorporaIds = new HashSet<string>(
                    // Use a HashSet to ensure there are no duplicate corpus ids
                    [
                        .. translationBuild
                            .Pretranslate?.SelectMany(t => t.SourceFilters ?? [])
                            .Select(f => f.Corpus.Id) ?? [],
                        .. translationBuild.TrainOn?.SelectMany(t => t.SourceFilters ?? []).Select(f => f.Corpus.Id)
                            ?? [],
                        .. translationBuild.TrainOn?.SelectMany(t => t.TargetFilters ?? []).Select(f => f.Corpus.Id)
                            ?? [],
                    ]
                ),
                ParallelCorporaIds = new HashSet<string>(
                    // Use a HashSet to ensure there are no duplicate parallel corpus ids
                    [
                        .. translationBuild
                            .Pretranslate?.Select(t => t.ParallelCorpus?.Id)
                            .Where(id => !string.IsNullOrEmpty(id)) ?? [],
                        .. translationBuild
                            .TrainOn?.Select(t => t.ParallelCorpus?.Id)
                            .Where(id => !string.IsNullOrEmpty(id)) ?? [],
                    ]
                ),
                DateFinished = translationBuild.DateFinished,
                Step = translationBuild.Step,
                TranslationEngineId = translationBuild.Engine.Id,
            },
        };

    private static ServalEngineDto CreateDto(TranslationEngine translationEngine) =>
        new ServalEngineDto
        {
            Id = translationEngine.Id,
            Confidence = translationEngine.Confidence / 100.0,
            TrainedSegmentCount = translationEngine.CorpusSize,
            SourceLanguageTag = translationEngine.SourceLanguage,
            TargetLanguageTag = translationEngine.TargetLanguage,
        };

    /// <summary>
    /// This method maps Serval API exceptions to the exceptions that Machine.js understands.
    /// </summary>
    /// <param name="e">The Serval API Exception</param>>
    /// <exception cref="DataNotFoundException">Entity Deleted.</exception>
    /// <exception cref="ForbiddenException">Access Denied.</exception>
    /// <exception cref="NotSupportedException">
    /// Method not allowed or not supported for the specified translation engine.
    /// </exception>
    /// <remarks>
    /// If this method returns, it is expected that the DTO will be null.
    /// The following status codes may be thrown by Serval, and are not handled by this method:
    ///  - 499: Operation Cancelled
    /// </remarks>
    private static void ProcessServalApiException(ServalApiException e)
    {
        switch (e)
        {
            case { StatusCode: StatusCodes.Status204NoContent }:
                throw new DataNotFoundException("Entity Deleted");
            case { StatusCode: StatusCodes.Status400BadRequest }:
                throw new NotSupportedException();
            case { StatusCode: StatusCodes.Status401Unauthorized }:
            case { StatusCode: StatusCodes.Status403Forbidden }:
                throw new ForbiddenException();
            case { StatusCode: StatusCodes.Status404NotFound }:
                throw new DataNotFoundException("Entity Deleted");
            case { StatusCode: StatusCodes.Status405MethodNotAllowed }:
                throw new NotSupportedException();
            case { StatusCode: StatusCodes.Status408RequestTimeout }:
                return;
            case { StatusCode: StatusCodes.Status409Conflict }:
                throw new InvalidOperationException();
            default:
                throw e;
        }
    }

    private static ServalBuildDto UpdateDto(ServalBuildDto buildDto, string sfProjectId)
    {
        buildDto.Href = MachineApi.GetBuildHref(sfProjectId, buildDto.Id);
        buildDto.Engine = new ServalResourceDto { Id = sfProjectId, Href = MachineApi.GetEngineHref(sfProjectId) };

        // We use this special ID format so that the DTO ID can be an optional URL parameter
        buildDto.Id = $"{sfProjectId}.{buildDto.Id}".TrimEnd('.');
        return buildDto;
    }

    private static ServalEngineDto UpdateDto(ServalEngineDto engineDto, string sfProjectId)
    {
        engineDto.Href = MachineApi.GetEngineHref(sfProjectId);
        engineDto.Id = sfProjectId;
        engineDto.Projects = [new ServalResourceDto { Href = MachineApi.GetEngineHref(sfProjectId), Id = sfProjectId }];
        return engineDto;
    }

    private async Task<SFProject> EnsureProjectPermissionAsync(string curUserId, string sfProjectId)
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Check for permission
        MachineApi.EnsureProjectPermission(curUserId, project);

        // Return the project, in case the caller needs it
        return project;
    }

    private async Task<string> GetTranslationIdAsync(
        string sfProjectId,
        bool preTranslate,
        bool returnEmptyStringIfMissing = false
    )
    {
        // Load the project secret, so we can get the translation engine ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            return returnEmptyStringIfMissing
                ? string.Empty
                : throw new DataNotFoundException("The project secret is missing");
        }

        // Ensure we have a translation engine ID
        string? translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            return returnEmptyStringIfMissing
                ? string.Empty
                : throw new DataNotFoundException("The translation engine is not configured");
        }

        return translationEngineId;
    }
}
