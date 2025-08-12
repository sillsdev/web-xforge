using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Hangfire;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using Newtonsoft.Json;
using Serval.Client;
using SIL.Converters.Usj;
using SIL.ObjectModel;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using TextInfo = SIL.XForge.Scripture.Models.TextInfo;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Machine API service for use with <see cref="Controllers.MachineApiController"/>.
/// </summary>
public class MachineApiService(
    IBackgroundJobClient backgroundJobClient,
    IDeltaUsxMapper deltaUsxMapper,
    IEmailService emailService,
    IEventMetricService eventMetricService,
    IExceptionHandler exceptionHandler,
    IHttpRequestAccessor httpRequestAccessor,
    IHubContext<NotificationHub, INotifier> hubContext,
    IStringLocalizer<SharedResource> localizer,
    ILogger<MachineApiService> logger,
    IParatextService paratextService,
    IPreTranslationService preTranslationService,
    IRepository<SFProjectSecret> projectSecrets,
    ISFProjectRights projectRights,
    ISFProjectService projectService,
    IRealtimeService realtimeService,
    IOptions<ServalOptions> servalOptions,
    IOptions<SiteOptions> siteOptions,
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

    /// <summary>
    /// The Finishing build state.
    /// </summary>
    /// <remarks>
    /// SF returns this state while the webhook is running and the drafts are being downloaded to SF.
    /// </remarks>
    internal const string BuildStateFinishing = "FINISHING";

    private static readonly IEqualityComparer<IList<int>> _listIntComparer = SequenceEqualityComparer.Create(
        EqualityComparer<int>.Default
    );
    private static readonly IEqualityComparer<IList<string>> _listStringComparer = SequenceEqualityComparer.Create(
        EqualityComparer<string>.Default
    );
    private static readonly IEqualityComparer<IList<ProjectScriptureRange>> _listProjectScriptureRangeComparer =
        SequenceEqualityComparer.Create(EqualityComparer<ProjectScriptureRange>.Default);

    public async Task BuildCompletedAsync(string sfProjectId, string buildId, string buildState, Uri websiteUrl)
    {
        try
        {
            // Retrieve the build started from the event metric. We do this as there may be multiple builds started,
            // and this ensures that only builds that want to send an email will have one sent.
            var eventMetrics = await eventMetricService.GetEventMetricsAsync(
                sfProjectId,
                scopes: [EventScope.Drafting],
                eventTypes: [nameof(MachineProjectService.BuildProjectAsync)]
            );
            EventMetric eventMetric = eventMetrics.Results.LastOrDefault(e => e.Result == buildId);
            if (eventMetric is not null && !string.IsNullOrWhiteSpace(eventMetric.UserId))
            {
                // Get the build config from the event metric, by converting BSON to JSON, and then to the object type
                BuildConfig buildConfig = JsonConvert.DeserializeObject<BuildConfig>(
                    eventMetric.Payload["buildConfig"].ToJson()
                );

                // Send the email if requested
                if (buildConfig.SendEmailOnBuildFinished)
                {
                    // Get the user when requested the build
                    await using IConnection conn = await realtimeService.ConnectAsync(eventMetric.UserId);
                    IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
                    IDocument<User> userDoc = await conn.FetchAsync<User>(eventMetric.UserId);
                    if (projectDoc.IsLoaded && userDoc.IsLoaded && emailService.ValidateEmail(userDoc.Data.Email))
                    {
                        // Set the locale for the email
                        CultureInfo.CurrentUICulture = new CultureInfo(userDoc.Data.InterfaceLanguage);

                        // Build the email
                        string resourceKeySubject =
                            buildState == nameof(JobState.Completed)
                                ? SharedResource.Keys.DraftGeneratedEmailSubject
                                : SharedResource.Keys.DraftNotGeneratedEmailSubject;
                        string subject = localizer[resourceKeySubject, siteOptions.Value.Name];
                        string resourceKeyBody = buildState switch
                        {
                            nameof(JobState.Completed) => SharedResource.Keys.DraftGeneratedEmailBody,
                            nameof(JobState.Canceled) => SharedResource.Keys.DraftCanceledEmailBody,
                            _ => SharedResource.Keys.DraftFailedEmailBody,
                        };
                        string url = $"{websiteUrl.ToString().TrimEnd('/')}/{buildId}/draft-generation";
                        string body =
                            $"<p>{localizer[resourceKeyBody, projectDoc.Data.ShortName]}</p>"
                            + $"<p>{localizer[SharedResource.Keys.DraftEmailMoreInformation, url]}</p>";
                        await emailService.SendEmailAsync(userDoc.Data.Email, subject, body);
                    }
                    else
                    {
                        logger.LogError(
                            "An email was requested for build {buildId} on project {projectId},"
                                + " but the user {userId} was not found",
                            buildId.Sanitize(),
                            sfProjectId.Sanitize(),
                            eventMetric.UserId.Sanitize()
                        );
                    }
                }
            }
            else
            {
                logger.LogInformation(
                    "The build event metric could not be retrieve for project {projectId} running in background job.",
                    sfProjectId.Sanitize()
                );
            }
        }
        catch (Exception e)
        {
            // Log the error and report to bugsnag
            logger.LogError(
                e,
                "Build exception occurred for project {projectId} running in background job.",
                sfProjectId.Sanitize()
            );
            exceptionHandler.ReportException(e);
        }
    }

    public async Task<string?> CancelPreTranslationBuildAsync(
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
        string translationEngineId = GetTranslationEngineId(projectSecret, preTranslate: true);

        try
        {
            // Cancel the build on Serval
            TranslationBuild translationBuild = await translationEnginesClient.CancelBuildAsync(
                translationEngineId,
                cancellationToken
            );

            // Return the build id so it can be logged
            return translationBuild.Id;
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // We do not mind if a 404 exception comes from Serval - we can assume the job is now cancelled
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // No build was cancelled
        return null;
    }

    public async Task ExecuteWebhookAsync(string json, string signature)
    {
        // Generate a signature for the JSON
        string calculatedSignature = CalculateSignature(json);

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

        // Notify any SignalR clients subscribed to the project
        string buildId = delivery.Payload.Build.Id;
        string buildState = delivery.Payload.BuildState;
        await hubContext.NotifyBuildProgress(projectId, new ServalBuildState { BuildId = buildId, State = buildState });

        // We only support translation build finished events for completed builds
        if (delivery.Event != nameof(WebhookEvent.TranslationBuildFinished))
        {
            return;
        }

        // Job was canceled or faulted
        if (buildState != nameof(JobState.Completed))
        {
            backgroundJobClient.Enqueue<IMachineApiService>(r =>
                r.BuildCompletedAsync(projectId, buildId, buildState, httpRequestAccessor.SiteRoot)
            );
            return;
        }

        // Record that the webhook was run successfully
        var arguments = new Dictionary<string, object>
        {
            { "buildId", buildId },
            { "buildState", buildState },
            { "event", delivery.Event },
            { "translationEngineId", delivery.Payload.Engine.Id },
        };
        await eventMetricService.SaveEventMetricAsync(
            projectId,
            userId: null,
            nameof(ExecuteWebhookAsync),
            EventScope.Drafting,
            arguments,
            result: buildId,
            exception: null
        );

        // Run the background job
        string jobId = backgroundJobClient.Enqueue<IMachineApiService>(r =>
            r.RetrievePreTranslationStatusAsync(projectId, CancellationToken.None)
        );

        // Run the build completed job afterward, which will notify the user if needed
        backgroundJobClient.ContinueJobWith<IMachineApiService>(
            jobId,
            r => r.BuildCompletedAsync(projectId, buildId, buildState, httpRequestAccessor.SiteRoot),
            JobContinuationOptions.OnAnyFinishedState
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

        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

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
            buildDto = UpdateDto(buildDto, project.TranslateConfig.DraftConfig);
            buildDto = UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<IReadOnlyList<ServalBuildDto>> GetBuildsAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        // Set up the list of builds to be returned
        List<ServalBuildDto> builds = [];

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

        // Execute on Serval, if it is enabled
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);

        // Get the builds from Serval
        IList<TranslationBuild> translationBuilds = [];
        try
        {
            translationBuilds = await translationEnginesClient.GetAllBuildsAsync(
                translationEngineId,
                cancellationToken
            );
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // Get the event metrics for build configurations, if we are pre-translating
        QueryResults<EventMetric> eventMetrics = QueryResults<EventMetric>.Empty;
        if (preTranslate)
        {
            eventMetrics = await eventMetricService.GetEventMetricsAsync(
                sfProjectId,
                scopes: [EventScope.Drafting],
                eventTypes:
                [
                    nameof(MachineProjectService.BuildProjectAsync),
                    nameof(RetrievePreTranslationStatusAsync),
                    nameof(StartPreTranslationBuildAsync),
                ]
            );
        }

        // Return the builds as DTOs
        foreach (TranslationBuild translationBuild in translationBuilds)
        {
            ServalBuildDto buildDto = CreateDto(translationBuild);

            // See if we have event metrics for downloading the pre-translation USFM to Scripture Forge
            EventMetric eventMetric = eventMetrics.Results.FirstOrDefault(e =>
                e.Result == translationBuild.Id && e.EventType == nameof(RetrievePreTranslationStatusAsync)
            );
            if (eventMetric is not null)
            {
                buildDto.AdditionalInfo!.DateGenerated = new DateTimeOffset(eventMetric.TimeStamp, TimeSpan.Zero);
            }

            // If we have event metrics for sending the build to Serval, add the scripture ranges to the DTO
            eventMetric = eventMetrics.Results.FirstOrDefault(e =>
                e.Result == translationBuild.Id && e.EventType == nameof(MachineProjectService.BuildProjectAsync)
            );
            if (eventMetric is not null)
            {
                buildDto = UpdateDto(buildDto, eventMetric);
            }
            else if (preTranslate)
            {
                // Fallback for builds previous to the event metric being recorded:
                //  - As there is no event metric, get the translation scripture range from the pre-translation corpus
                //  - We cannot accurately determine the source projects, so do not record the training scripture ranges.

                // Get the translation scripture range
                PretranslateCorpus translationCorpus = translationBuild.Pretranslate?.FirstOrDefault();
                if (translationCorpus is not null)
                {
#pragma warning disable CS0612 // Type or member is obsolete
                    string scriptureRange =
                        translationCorpus.SourceFilters?.FirstOrDefault()?.ScriptureRange
                        ?? translationCorpus.ScriptureRange;
#pragma warning restore CS0612 // Type or member is obsolete
                    if (!string.IsNullOrWhiteSpace(scriptureRange))
                    {
                        buildDto.AdditionalInfo!.TranslationScriptureRanges.Add(
                            new ProjectScriptureRange { ProjectId = sfProjectId, ScriptureRange = scriptureRange }
                        );
                    }
                }

                // Get the training scripture range
                TrainingCorpus trainingCorpus = translationBuild.TrainOn?.FirstOrDefault();
                if (trainingCorpus is not null)
                {
#pragma warning disable CS0612 // Type or member is obsolete
                    string scriptureRange =
                        trainingCorpus.SourceFilters?.FirstOrDefault()?.ScriptureRange ?? trainingCorpus.ScriptureRange;
#pragma warning restore CS0612 // Type or member is obsolete
                    if (!string.IsNullOrWhiteSpace(scriptureRange))
                    {
                        // We do not accurately know the training, project, so leave it blank
                        buildDto.AdditionalInfo!.TrainingScriptureRanges.Add(
                            new ProjectScriptureRange { ProjectId = string.Empty, ScriptureRange = scriptureRange }
                        );
                    }
                }
            }

            // Make sure the DTO conforms to the machine-api URLs
            builds.Add(UpdateDto(buildDto, sfProjectId));
        }

        // See if any builds are queued at our end
        ServalBuildDto? queuedState = await GetQueuedStateAsync(
            curUserId,
            sfProjectId,
            preTranslate,
            isServalAdmin,
            cancellationToken
        );
        if (queuedState is not null && queuedState.State != BuildStateFinishing)
        {
            // The last build started will match the queued state
            EventMetric eventMetric = eventMetrics.Results.LastOrDefault(e =>
                e.EventType == nameof(StartPreTranslationBuildAsync)
            );
            if (preTranslate && eventMetric is not null)
            {
                queuedState = UpdateDto(queuedState, eventMetric);
            }

            builds.Add(queuedState);
        }

        return builds;
    }

    public async Task<ServalBuildDto?> GetLastCompletedPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

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
                // Verify that each book/chapter from the translationBuild is marked HasDraft = true
                // If the projects texts chapters are not all marked as having a draft, then the webhook likely failed
                // and we want to retrieve the pre-translation status to update the chapters as having a draft
                Dictionary<string, List<int>> scriptureRangesWithDrafts = [];

                IList<PretranslateCorpus> pretranslateCorpus = translationBuild.Pretranslate ?? [];

                // Retrieve the user secret
                Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(curUserId);
                if (!attempt.TryResult(out UserSecret userSecret))
                {
                    throw new DataNotFoundException("The user does not exist.");
                }

                ScrVers versification =
                    paratextService.GetParatextSettings(userSecret, project.ParatextId)?.Versification
                    ?? VerseRef.defaultVersification;

                ScriptureRangeParser scriptureRangeParser = new ScriptureRangeParser(versification);

                // Create the dictionary of scripture range bookIds and bookNums to check against the project texts
                Dictionary<string, int> scriptureRangeBooksWithDraft = [];

                foreach (PretranslateCorpus ptc in pretranslateCorpus)
                {
                    // We are using the TranslationBuild.Pretranslate.SourceFilters.ScriptureRange to find the
                    // books selected for drafting. Some projects may have used the now obsolete field
                    // TranslationBuild.Pretranslate.ScriptureRange and will not get checked for webhook failures.
                    foreach (
                        ParallelCorpusFilter source in ptc.SourceFilters?.Where(s => s.ScriptureRange is not null) ?? []
                    )
                    {
                        foreach (
                            (string book, List<int> bookChapters) in scriptureRangeParser.GetChapters(
                                source.ScriptureRange
                            )
                        )
                        {
                            int bookNum = Canon.BookIdToNumber(book);
                            scriptureRangeBooksWithDraft.Add(book, bookNum);
                            // Ensure that if chapters is blank, it contains every chapter in the book
                            List<int> chapters = bookChapters;
                            if (chapters.Count == 0)
                            {
                                chapters = [.. Enumerable.Range(1, versification.GetLastChapter(bookNum))];
                            }

                            // Set or merge the list of chapters
                            if (!scriptureRangesWithDrafts.TryGetValue(book, out List<int> existingChapters))
                            {
                                scriptureRangesWithDrafts[book] = chapters;
                            }
                            else
                            {
                                // Merge new chapters into existing list, avoiding duplicates
                                foreach (int chapter in chapters.Where(chapter => !existingChapters.Contains(chapter)))
                                {
                                    existingChapters.Add(chapter);
                                }

                                // Add existing chapters to the books chapter list
                                scriptureRangesWithDrafts[book].AddRange(existingChapters);
                            }
                        }
                    }
                }

                // check if any chapters from the scripture range are marked as HasDraft = false or null
                bool hasDraftIsFalseOrNullInScriptureRange =
                    scriptureRangeBooksWithDraft.Count > 0
                    && scriptureRangeBooksWithDraft.All(kvp =>
                    {
                        return project.Texts.Any(text =>
                            text.BookNum == kvp.Value
                            && text.Chapters.Where(chapter =>
                                    scriptureRangesWithDrafts[kvp.Key].Contains(chapter.Number)
                                )
                                .Any(c => !(c.HasDraft ?? false))
                        );
                    });

                if (hasDraftIsFalseOrNullInScriptureRange)
                {
                    // Chapters HasDraft is missing or false but should be true, retrieve the pre-translation status to update them.
                    backgroundJobClient.Enqueue<IMachineApiService>(r =>
                        r.RetrievePreTranslationStatusAsync(sfProjectId, CancellationToken.None)
                    );
                }

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

        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

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

            // Notify any SignalR clients subscribed to the project of the current build's state
            string buildId = translationBuild.Id;
            string buildState = translationBuild.State.ToString();
            await hubContext.NotifyBuildProgress(
                sfProjectId,
                new ServalBuildState { BuildId = buildId, State = buildState }
            );

            buildDto = CreateDto(translationBuild);
            buildDto = UpdateDto(buildDto, project.TranslateConfig.DraftConfig);
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
        bool isServalAdmin,
        DateTime timestamp,
        DraftUsfmConfig? draftUsfmConfig,
        CancellationToken cancellationToken
    )
    {
        // Do not allow retrieving the entire book as a delta
        if (chapterNum == 0)
        {
            throw new DataNotFoundException("Chapter not specified");
        }

        // Get the USJ document
        IUsj usj = await GetPreTranslationUsjAsync(
            curUserId,
            sfProjectId,
            bookNum,
            chapterNum,
            isServalAdmin,
            timestamp,
            draftUsfmConfig,
            cancellationToken
        );

        // Then convert it to USX
        XDocument usxDoc = UsjToUsx.UsjToUsxXDocument(usj);

        // Then convert it to a Delta
        return new Snapshot<TextData>
        {
            Id = TextData.GetTextDocId(sfProjectId, bookNum, chapterNum),
            Version = 0,
            Data = new TextData(deltaUsxMapper.ToChapterDeltas(usxDoc).First().Delta),
        };
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

        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

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
                // If the webhook is running, and no build is queued, display that as a build state to the user
                // We don't show this if a build is queued, as we will want that build's state to be displayed
                if (preTranslate && queuedAt is null && projectSecret.ServalData.PreTranslationsRetrieved == false)
                {
                    buildDto = new ServalBuildDto
                    {
                        State = BuildStateFinishing,
                        Message = "The draft books are being retrieved.",
                        AdditionalInfo = new ServalBuildAdditionalInfo
                        {
                            TranslationEngineId = engineId ?? string.Empty,
                        },
                    };
                }
                else if (queuedAt is null)
                {
                    // If we do not have build queued, do not return a build dto
                    return null;
                }
                else if (queuedAt <= DateTime.UtcNow.AddHours(-6))
                {
                    // If the build was queued 6 hours or more ago, it will have failed to upload
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

            // Make sure the DTO conforms to the machine-api V2 URLs
            if (buildDto is not null)
            {
                buildDto = UpdateDto(buildDto, project.TranslateConfig.DraftConfig);
                buildDto = UpdateDto(buildDto, sfProjectId);
            }
        }

        return buildDto;
    }

    /// <summary>
    /// Gets the pre-translation draft revisions present for the specified book and chapter.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number.</param>
    /// <param name="isServalAdmin">If <c>true</c>, the user is a serval administrator.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The document revisions.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to access the Serval/Machine API.
    /// </exception>
    public async Task<IReadOnlyList<DocumentRevision>> GetPreTranslationRevisionsAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        CancellationToken cancellationToken
    )
    {
        // Set up the list of revisions to be returned
        List<DocumentRevision> revisions = [];

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

        await using IConnection connection = await realtimeService.ConnectAsync(curUserId);
        string id = TextDocument.GetDocId(sfProjectId, bookNum, chapterNum, TextDocument.Draft);
        Op[] ops = await connection.GetOpsAsync<TextDocument>(id);

        // If there are no ops, just get the most recent revision from Serval
        if (ops.Length == 0)
        {
            ServalBuildDto? build = await GetLastCompletedPreTranslationBuildAsync(
                curUserId,
                sfProjectId,
                isServalAdmin,
                cancellationToken
            );
            if (build is not null)
            {
                revisions.Add(
                    new DocumentRevision
                    {
                        Source = OpSource.Draft,
                        Timestamp = build.AdditionalInfo?.DateFinished?.UtcDateTime ?? DateTime.UtcNow,
                    }
                );
            }
        }
        else
        {
            // Draft Ops are not user created, so we do not need to milestone them,
            // like we do in ParatextService.GetRevisionHistoryAsync()
            foreach (Op op in ops)
            {
                // Allow cancellation
                if (cancellationToken.IsCancellationRequested)
                {
                    break;
                }

                revisions.Add(
                    new DocumentRevision
                    {
                        Source = op.Metadata.Source ?? OpSource.Draft,
                        Timestamp = op.Metadata.Timestamp,
                        UserId = op.Metadata.UserId,
                    }
                );
            }
        }

        // Display the revisions in descending order to match the history API endpoint
        revisions.Reverse();
        return revisions;
    }

    public async Task<string> GetPreTranslationUsfmAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        DateTime timestamp,
        DraftUsfmConfig? draftUsfmConfig,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

        // If the user is a serval admin, get the highest ranked user on the project
        string userId = isServalAdmin ? GetHighestRankedUserId(project) : curUserId;

        // Retrieve the user secret
        Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(userId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user does not exist.");
        }

        // Get the USJ document
        IUsj usj = await GetPreTranslationUsjAsync(
            curUserId,
            sfProjectId,
            bookNum,
            chapterNum,
            isServalAdmin,
            timestamp,
            draftUsfmConfig,
            cancellationToken
        );

        // Then convert it to USX
        XDocument usx = UsjToUsx.UsjToUsxXDocument(usj);

        // Then convert it to USFM
        return paratextService.ConvertUsxToUsfm(userSecret, project.ParatextId, bookNum, usx);
    }

    public async Task<IUsj> GetPreTranslationUsjAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        bool isServalAdmin,
        DateTime timestamp,
        DraftUsfmConfig? draftUsfmConfig,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId, isServalAdmin);

        // If the user is a serval admin, get the highest ranked user on the project
        string userId = isServalAdmin ? GetHighestRankedUserId(project) : curUserId;

        // Connect to the realtime server
        await using IConnection connection = await realtimeService.ConnectAsync(userId);
        string id = TextDocument.GetDocId(sfProjectId, bookNum, chapterNum, TextDocument.Draft);

        // First, see if the document exists in the realtime service, if the chapter is not 0
        IDocument<TextDocument>? textDocument = null;
        if (chapterNum != 0 && draftUsfmConfig is null)
        {
            textDocument = await connection.FetchAsync<TextDocument>(id);
            if (textDocument.IsLoaded)
            {
                // Retrieve the snapshot if it exists
                Snapshot<TextDocument> snapshot = await connection.FetchSnapshotAsync<TextDocument>(id, timestamp);
                if (snapshot.Data is not null)
                {
                    return snapshot.Data;
                }

                // There is no draft at the timestamp
                throw new DataNotFoundException("A draft cannot be retrieved at that timestamp");
            }
        }

        // Retrieve the user secret
        Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(userId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user does not exist.");
        }

        DraftUsfmConfig config =
            draftUsfmConfig ?? project.TranslateConfig.DraftConfig.UsfmConfig ?? new DraftUsfmConfig();

        // There is no snapshot or the snapshot is being ignored, so retrieve the draft from Serval
        try
        {
            string usfm = await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                config,
                cancellationToken
            );
            string usx = paratextService.GetBookText(userSecret, project.ParatextId, bookNum, usfm);
            IUsj usj = UsxToUsj.UsxStringToUsj(usx);

            // Do not save the USJ if the chapter is 0 or accessing the snapshot is ignored
            if (chapterNum != 0 && draftUsfmConfig is null)
            {
                await SaveTextDocumentAsync(textDocument!, usj);
            }

            return usj;
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
        bool isServalAdmin,
        DateTime timestamp,
        DraftUsfmConfig? draftUsfmConfig,
        CancellationToken cancellationToken
    )
    {
        // Get the USJ then convert to USX
        IUsj usj = await GetPreTranslationUsjAsync(
            curUserId,
            sfProjectId,
            bookNum,
            chapterNum,
            isServalAdmin,
            timestamp,
            draftUsfmConfig,
            cancellationToken
        );
        return UsjToUsx.UsjToUsxString(usj);
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
        LanguageInfo languageInfo = await translationEngineTypesClient.GetLanguageInfoAsync(
            engineType: MachineProjectService.Nmt,
            languageCode,
            cancellationToken
        );
        return new LanguageDto
        {
            LanguageCode = languageInfo.InternalCode ?? languageCode,
            IsSupported = languageInfo.IsNative,
        };
    }

    /// <summary>
    /// Retrieves the pre-translation status and text from Serval.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The id of the build the pre-translations were retrieved for.</returns>
    /// <remarks>We return the build id so it can be logged in event metrics.</remarks>
    public async Task<string?> RetrievePreTranslationStatusAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    )
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
                // Get the last completed build
                string translationEngineId = GetTranslationEngineId(projectSecret, preTranslate: true);
                TranslationBuild? translationBuild = (
                    await translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)
                )
                    .Where(b => b.State == JobState.Completed)
                    .MaxBy(b => b.DateFinished);

                // Set the retrieved flag as in progress
                await projectSecrets.UpdateAsync(
                    sfProjectId,
                    u => u.Set(p => p.ServalData.PreTranslationsRetrieved, false)
                );

                // Get the pre-translations
                await preTranslationService.UpdatePreTranslationStatusAsync(sfProjectId, cancellationToken);

                // Update the pre-translation text documents
                await UpdatePreTranslationTextDocumentsAsync(sfProjectId, cancellationToken);

                // Set the retrieved flag as complete
                await projectSecrets.UpdateAsync(
                    sfProjectId,
                    u => u.Set(p => p.ServalData.PreTranslationsRetrieved, true)
                );

                // Notify any SignalR clients subscribed to the project
                await hubContext.NotifyBuildProgress(
                    sfProjectId,
                    new ServalBuildState
                    {
                        BuildId = translationBuild?.Id,
                        State = nameof(ServalData.PreTranslationsRetrieved),
                    }
                );

                // Return the build id
                return translationBuild?.Id;
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
            const string message =
                "Retrieve pre-translation status exception occurred for project {sfProjectId} running in background job.";
            logger.LogError(e, message, sfProjectId.Sanitize());
            exceptionHandler.ReportException(e);

            // Ensure that the retrieved flag is cleared
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationsRetrieved));
        }

        return null;
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

        // Ensure that the user has permission to create drafts (as the logic for SMT builds is shared with draft generation)
        if (!projectRights.HasRight(projectDoc.Data, curUserId, SFProjectDomain.Drafts, Operation.Create))
        {
            throw new ForbiddenException();
        }

        // Sync the source and target before running the build
        // We use project service, as it provides permission and token checks
        string syncJobId = await projectService.SyncAsync(curUserId, sfProjectId);

        // Run the training after the sync has completed. If the sync failed or stopped, retrain anyway
        string buildJobId = backgroundJobClient.ContinueJobWith<IMachineProjectService>(
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

        // Ensure that the user has permission to create drafts
        if (!projectRights.HasRight(projectDoc.Data, curUserId, SFProjectDomain.Drafts, Operation.Create))
        {
            throw new ForbiddenException();
        }

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
            op.Set(p => p.TranslateConfig.DraftConfig.FastTraining, buildConfig.FastTraining);
            op.Set(p => p.TranslateConfig.DraftConfig.SendEmailOnBuildFinished, buildConfig.SendEmailOnBuildFinished);
            op.Set(p => p.TranslateConfig.DraftConfig.UseEcho, buildConfig.UseEcho);
            if (!projectDoc.Data.TranslateConfig.PreTranslate)
            {
                op.Set(p => p.TranslateConfig.PreTranslate, true);
            }
        });

        // Sync the source and target before running the build
        // We use project service, as it provides permission and token checks
        string jobId = await projectService.SyncAsync(curUserId, buildConfig.ProjectId);

        // Store the project ids in a hashset to prevent duplicates
        HashSet<string> syncProjectIds = [];

        // If we have an alternate source, sync that first
        string alternateSourceProjectId = projectDoc.Data.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef;
        if (
            projectDoc.Data.TranslateConfig.DraftConfig.AlternateSourceEnabled
            && !string.IsNullOrWhiteSpace(alternateSourceProjectId)
        )
        {
            syncProjectIds.Add(alternateSourceProjectId);
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
            syncProjectIds.Add(alternateTrainingSourceProjectId);
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
            syncProjectIds.Add(additionalTrainingSourceProjectId);
        }

        // Remove the source project, as it was synced when the target was synced
        string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
        if (sourceProjectId is not null && syncProjectIds.Contains(sourceProjectId))
        {
            syncProjectIds.Remove(sourceProjectId);
        }

        // Sync the projects
        foreach (string syncProjectId in syncProjectIds)
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = syncProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // Run the training after the sync has completed
        // NOTE: This must be MachineProjectService, not IMachineProjectService
        //       so that the interceptor functions for BuildProjectAsync().
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
        IEnumerable<TranslationResult> translationResults = [];

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
    /// Calculate the SHA256 HMAC signature for the given JSON payload using the webhook secret.
    /// </summary>
    /// <param name="json">The JSON payload.</param>
    /// <returns>The SHA256 HMAC signature.</returns>
    /// <remarks>This method is internal so unit tests can use it.</remarks>
    internal string CalculateSignature(string json)
    {
        using HMACSHA256 hmacHasher = new HMACSHA256(Encoding.UTF8.GetBytes(servalOptions.Value.WebhookSecret));
        byte[] hash = hmacHasher.ComputeHash(Encoding.UTF8.GetBytes(json));
        return $"sha256={Convert.ToHexString(hash)}";
    }

    /// <summary>
    /// Updates the text documents locally with the latest pre-translation drafts.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>An asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">Required data could not be found.</exception>
    /// <remarks>This can be mocked in unit tests.</remarks>
    protected internal virtual async Task UpdatePreTranslationTextDocumentsAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Get the user to perform this action as
        string userId = GetHighestRankedUserId(projectDoc.Data);

        // Retrieve the user secret
        Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(userId);
        if (!attempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user does not exist.");
        }

        // Load the project secrets, so we can get the translation engine ID and corpus ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Get the translation engine id
        string translationEngineId = projectSecret.ServalData?.PreTranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine ID cannot be found.");
        }

        // Get the parallel corpus id
        string parallelCorpusId = projectSecret.ServalData?.ParallelCorpusIdForPreTranslate;
        if (string.IsNullOrWhiteSpace(parallelCorpusId))
        {
            throw new DataNotFoundException("The parallel corpus ID cannot be found.");
        }

        // Ensure that the selected user has permission to create drafts
        if (!projectRights.HasRight(projectDoc.Data, userId, SFProjectDomain.Drafts, Operation.Create))
        {
            throw new ForbiddenException();
        }

        // For every text we have a draft applied to, get the pre-translation
        foreach (TextInfo textInfo in projectDoc.Data.Texts.Where(t => t.Chapters.Any(c => c.HasDraft == true)))
        {
            // Set up variables
            string paratextId = projectDoc.Data.ParatextId;
            int bookNum = textInfo.BookNum;
            int chapterNum = 0;

            // Get the USFM
            string usfm = await preTranslationService.GetPreTranslationUsfmAsync(
                sfProjectId,
                bookNum,
                chapterNum,
                projectDoc.Data.TranslateConfig.DraftConfig.UsfmConfig ?? new DraftUsfmConfig(),
                cancellationToken
            );

            // Iterate over the chapters from the USFM, not the chapters that have drafts, as the target text may
            // not yet have all the corresponding chapters and books, but might have them added in the future.
            foreach (Usj usj in paratextService.GetChaptersAsUsj(userSecret, paratextId, bookNum, usfm))
            {
                // Save the USJ to the realtime service
                string id = TextDocument.GetDocId(sfProjectId, bookNum, ++chapterNum, TextDocument.Draft);
                IDocument<TextDocument> textDocument = await conn.FetchAsync<TextDocument>(id);
                await SaveTextDocumentAsync(textDocument, usj);
            }
        }
    }

    /// <summary>
    /// Creates the Build DTO for the front end.
    /// </summary>
    /// <param name="translationBuild">The translation build from Serval.</param>
    /// <returns>The build DTO.</returns>
    private static ServalBuildDto CreateDto(TranslationBuild translationBuild)
    {
        var buildDto = new ServalBuildDto
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

        // Create an initial value for the date requested, based on the object id from Mongo
        // This will be overwritten with the value from the EventMetric, if that exists
        if (ObjectId.TryParse(translationBuild.Id, out ObjectId objectId))
        {
            buildDto.AdditionalInfo!.DateRequested = new DateTimeOffset(objectId.CreationTime, TimeSpan.Zero);
        }

        return buildDto;
    }

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
    /// Gets the highest ranked user id on a project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <returns>The user id.</returns>
    private static string GetHighestRankedUserId(SFProject project)
    {
        // Rank the Paratext roles
        var rolePriority = new Dictionary<string, int>
        {
            { SFProjectRole.Administrator, 1 },
            { SFProjectRole.Translator, 2 },
            { SFProjectRole.Consultant, 3 },
            { SFProjectRole.PTObserver, 4 },
        };

        // Get the highest ranking user id, if the current user id is not set
        return project
            .UserRoles.Where(ur => SFProjectRole.IsParatextRole(ur.Value))
            .OrderBy(kvp => rolePriority[kvp.Value])
            .FirstOrDefault()
            .Key;
    }

    private static string GetTranslationEngineId(
        SFProjectSecret projectSecret,
        bool preTranslate,
        bool returnEmptyStringIfMissing = false
    )
    {
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

    /// <summary>
    /// Saves the text document to the realtime service.
    /// </summary>
    /// <param name="textDocument">The text document.</param>
    /// <param name="usj">The USJ to save to the text document.</param>
    /// <returns>The asynchronous task.</returns>
    private static async Task SaveTextDocumentAsync(IDocument<TextDocument> textDocument, IUsj usj)
    {
        // Create the USJ text document for the chapter
        TextDocument chapterTextDocument = new TextDocument(textDocument.Id, usj);

        // Create or update the text document
        if (!textDocument.IsLoaded)
        {
            await textDocument.CreateAsync(chapterTextDocument);
        }
        else
        {
            await textDocument.ReplaceAsync(chapterTextDocument, OpSource.Draft);
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

    private static ServalBuildDto UpdateDto(ServalBuildDto buildDto, DraftConfig draftConfig)
    {
        // Add the training scripture ranges
        buildDto.AdditionalInfo.TrainingScriptureRanges.Clear();
        foreach (ProjectScriptureRange scriptureRange in draftConfig.LastSelectedTrainingScriptureRanges)
        {
            buildDto.AdditionalInfo.TrainingScriptureRanges.Add(scriptureRange);
        }

        // Add the older training scripture range. We don't know what source project it came from
        if (!string.IsNullOrWhiteSpace(draftConfig.LastSelectedTrainingScriptureRange))
        {
            buildDto.AdditionalInfo.TrainingScriptureRanges.Add(
                new ProjectScriptureRange { ScriptureRange = draftConfig.LastSelectedTrainingScriptureRange }
            );
        }

        // Add the translation scripture ranges
        buildDto.AdditionalInfo.TranslationScriptureRanges.Clear();
        foreach (ProjectScriptureRange scriptureRange in draftConfig.LastSelectedTranslationScriptureRanges)
        {
            buildDto.AdditionalInfo.TranslationScriptureRanges.Add(scriptureRange);
        }

        // Add the older translation scripture range
        if (!string.IsNullOrWhiteSpace(draftConfig.LastSelectedTranslationScriptureRange))
        {
            buildDto.AdditionalInfo.TranslationScriptureRanges.Add(
                new ProjectScriptureRange { ScriptureRange = draftConfig.LastSelectedTranslationScriptureRange }
            );
        }
        return buildDto;
    }

    private static ServalBuildDto UpdateDto(ServalBuildDto buildDto, EventMetric eventMetric)
    {
        // Ensure that there is the Serval additional data
        buildDto.AdditionalInfo ??= new ServalBuildAdditionalInfo();

        // Set the user who requested the build and when they did so
        buildDto.AdditionalInfo.DateRequested = new DateTimeOffset(eventMetric.TimeStamp, TimeSpan.Zero);
        buildDto.AdditionalInfo.RequestedByUserId = eventMetric.UserId;

        // Retrieve the training and translation books from the build config, as the build from Serval
        // will not have project information.

        // Get the build config from the event metric, by converting BSON to JSON, and then to the object type
        BuildConfig buildConfig = JsonConvert.DeserializeObject<BuildConfig>(
            eventMetric.Payload["buildConfig"].ToJson()
        );

        // Add the training scripture ranges
        buildDto.AdditionalInfo.TrainingScriptureRanges.Clear();
        foreach (ProjectScriptureRange scriptureRange in buildConfig.TrainingScriptureRanges)
        {
            buildDto.AdditionalInfo.TrainingScriptureRanges.Add(scriptureRange);
        }

        // Add the older training scripture range. We don't know what source project it came from
        if (!string.IsNullOrWhiteSpace(buildConfig.TrainingScriptureRange))
        {
            buildDto.AdditionalInfo.TrainingScriptureRanges.Add(
                new ProjectScriptureRange { ScriptureRange = buildConfig.TrainingScriptureRange }
            );
        }

        // Add the translation scripture ranges
        buildDto.AdditionalInfo.TranslationScriptureRanges.Clear();
        foreach (ProjectScriptureRange scriptureRange in buildConfig.TranslationScriptureRanges)
        {
            buildDto.AdditionalInfo.TranslationScriptureRanges.Add(scriptureRange);
        }

        // Add the older translation scripture range
        if (!string.IsNullOrWhiteSpace(buildConfig.TranslationScriptureRange))
        {
            buildDto.AdditionalInfo.TranslationScriptureRanges.Add(
                new ProjectScriptureRange { ScriptureRange = buildConfig.TranslationScriptureRange }
            );
        }

        return buildDto;
    }

    private static ServalEngineDto UpdateDto(ServalEngineDto engineDto, string sfProjectId)
    {
        engineDto.Href = MachineApi.GetEngineHref(sfProjectId);
        engineDto.Id = sfProjectId;
        engineDto.Projects = [new ServalResourceDto { Href = MachineApi.GetEngineHref(sfProjectId), Id = sfProjectId }];
        return engineDto;
    }

    /// <summary>
    /// Ensures that the user has permission to access Serval and the project.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId"></param>
    /// <param name="isServalAdmin">If <c>true</c>, the current user is a Serval Administrator.</param>
    /// <returns>The project.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to access the Serval/Machine API.
    /// </exception>
    private async Task<SFProject> EnsureProjectPermissionAsync(
        string curUserId,
        string sfProjectId,
        bool isServalAdmin = false
    )
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // If the user is not a serval admin, ensure that the user has permission to create drafts
        if (!isServalAdmin && !projectRights.HasRight(project, curUserId, SFProjectDomain.Drafts, Operation.Create))
        {
            throw new ForbiddenException();
        }

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

        return GetTranslationEngineId(projectSecret, preTranslate, returnEmptyStringIfMissing);
    }
}
