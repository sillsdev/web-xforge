using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Translation;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
// The Machine Service uses Serval objects
using Phrase = Serval.Client.Phrase;
using TranslationResult = Serval.Client.TranslationResult;
using WordGraph = Serval.Client.WordGraph;
using WordGraphArc = Serval.Client.WordGraphArc;

namespace SIL.XForge.Scripture.Controllers;

[Route(MachineApiV2.Namespace)]
[ApiController]
[Authorize]
[Obsolete("This controller will be removed when JavaScript clients have updated to the latest Machine.js")]
public class MachineApiV2Controller : ControllerBase
{
    private const string MachineApiUnavailable = "Machine API is unavailable";
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IMachineApiService _machineApiService;
    private readonly IUserAccessor _userAccessor;

    public MachineApiV2Controller(
        IExceptionHandler exceptionHandler,
        IMachineApiService machineApiService,
        IUserAccessor userAccessor
    )
    {
        _machineApiService = machineApiService;
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    [HttpGet(MachineApiV2.GetBuild)]
    public async Task<ActionResult<BuildDto?>> GetBuildAsync(
        string sfProjectId,
        string? buildId,
        [FromQuery] int? minRevision,
        CancellationToken cancellationToken
    )
    {
        try
        {
            BuildDto? build = string.IsNullOrWhiteSpace(buildId)
                ? await _machineApiService.GetCurrentBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    minRevision,
                    preTranslate: false,
                    cancellationToken
                )
                : await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    sfProjectId,
                    buildId,
                    minRevision,
                    preTranslate: false,
                    cancellationToken
                );

            // A null means no build is running
            if (build is null)
            {
                return NoContent();
            }

            return Ok(UpdateDto(build));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpGet(MachineApiV2.GetEngine)]
    public async Task<ActionResult<EngineDto>> GetEngineAsync(string sfProjectId, CancellationToken cancellationToken)
    {
        try
        {
            EngineDto engine = await _machineApiService.GetEngineAsync(
                _userAccessor.UserId,
                sfProjectId,
                cancellationToken
            );
            return Ok(UpdateDto(engine));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApiV2.GetWordGraph)]
    public async Task<ActionResult<WordGraphDto>> GetWordGraphAsync(
        string sfProjectId,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            WordGraph wordGraph = await _machineApiService.GetWordGraphAsync(
                _userAccessor.UserId,
                sfProjectId,
                string.Join(' ', segment),
                cancellationToken
            );
            return Ok(CreateDto(wordGraph));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApiV2.StartBuild)]
    public async Task<ActionResult<BuildDto>> StartBuildAsync(
        [FromBody] string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        try
        {
            BuildDto build = await _machineApiService.StartBuildAsync(
                _userAccessor.UserId,
                sfProjectId,
                cancellationToken
            );
            return Ok(UpdateDto(build));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApiV2.TrainSegment)]
    public async Task<ActionResult> TrainSegmentAsync(
        string sfProjectId,
        [FromBody] SegmentPairDto segmentPair,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await _machineApiService.TrainSegmentAsync(
                _userAccessor.UserId,
                sfProjectId,
                GetSegmentPair(segmentPair),
                cancellationToken
            );
            return Ok();
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApiV2.Translate)]
    public async Task<ActionResult<TranslationResultDto>> TranslateAsync(
        string sfProjectId,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationResult translationResult = await _machineApiService.TranslateAsync(
                _userAccessor.UserId,
                sfProjectId,
                string.Join(' ', segment),
                cancellationToken
            );
            return Ok(CreateDto(translationResult));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    [HttpPost(MachineApiV2.TranslateN)]
    public async Task<ActionResult<TranslationResultDto[]>> TranslateNAsync(
        string sfProjectId,
        int n,
        [FromBody] string[] segment,
        CancellationToken cancellationToken
    )
    {
        try
        {
            TranslationResult[] translationResults = await _machineApiService.TranslateNAsync(
                _userAccessor.UserId,
                sfProjectId,
                n,
                string.Join(' ', segment),
                cancellationToken
            );
            return Ok(translationResults.Select(CreateDto));
        }
        catch (BrokenCircuitException e)
        {
            _exceptionHandler.ReportException(e);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
    }

    private static BuildDto UpdateDto(BuildDto buildDto)
    {
        buildDto.Href = MachineApiV2.GetBuildHref(buildDto.Engine.Id, buildDto.Id);
        buildDto.Engine.Href = MachineApiV2.GetEngineHref(buildDto.Engine.Id);
        return buildDto;
    }

    private static EngineDto UpdateDto(EngineDto engineDto)
    {
        engineDto.Href = MachineApiV2.GetEngineHref(engineDto.Id);
        return engineDto;
    }

    private static PhraseDto CreateDto(Phrase phrase) =>
        new PhraseDto { SourceSegmentRange = CreateRangeDto(phrase), TargetSegmentCut = phrase.TargetSegmentCut };

    private static TranslationResultDto CreateDto(TranslationResult translationResult) =>
        new TranslationResultDto
        {
            Target = translationResult.TargetTokens.ToArray(),
            Confidences = Array.ConvertAll(translationResult.Confidences.ToArray(), c => (float)c),
            Sources = translationResult.Sources.Select(CreateDto).ToArray(),
            Alignment = translationResult.Alignment.Select(CreateDto).ToArray(),
            Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
        };

    private static TranslationSources CreateDto(IList<TranslationSource> translationSourceList)
    {
        TranslationSources translationSources = TranslationSources.None;
        if (translationSourceList.Contains(TranslationSource.Primary))
        {
            translationSources |= TranslationSources.Smt;
        }

        if (translationSourceList.Contains(TranslationSource.Secondary))
        {
            translationSources |= TranslationSources.Transfer;
        }

        if (translationSourceList.Contains(TranslationSource.Human))
        {
            translationSources |= TranslationSources.Prefix;
        }

        return translationSources;
    }

    private static WordGraphDto CreateDto(WordGraph wordGraph) =>
        new WordGraphDto
        {
            InitialStateScore = wordGraph.InitialStateScore,
            FinalStates = wordGraph.FinalStates.ToArray(),
            Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
        };

    private static WordGraphArcDto CreateDto(WordGraphArc arc) =>
        new WordGraphArcDto
        {
            PrevState = arc.PrevState,
            NextState = arc.NextState,
            Score = (float)arc.Score,
            Words = arc.TargetTokens.ToArray(),
            Confidences = Array.ConvertAll(arc.Confidences.ToArray(), c => (float)c),
            SourceSegmentRange = CreateRangeDto(arc),
            Sources = arc.Sources.Select(CreateDto).ToArray(),
            Alignment = arc.Alignment.Select(CreateDto).ToArray(),
        };

    private static AlignedWordPairDto CreateDto(AlignedWordPair alignedWordPair) =>
        new AlignedWordPairDto { SourceIndex = alignedWordPair.SourceIndex, TargetIndex = alignedWordPair.TargetIndex };

    private static RangeDto CreateRangeDto(Phrase phrase) =>
        new RangeDto { Start = phrase.SourceSegmentStart, End = phrase.SourceSegmentEnd };

    private static RangeDto CreateRangeDto(WordGraphArc arc) =>
        new RangeDto { Start = arc.SourceSegmentStart, End = arc.SourceSegmentEnd };

    private static SegmentPair GetSegmentPair(SegmentPairDto segmentPairDto) =>
        new SegmentPair
        {
            SentenceStart = segmentPairDto.SentenceStart,
            SourceSegment = string.Join(' ', segmentPairDto.SourceSegment ?? Array.Empty<string>()),
            TargetSegment = string.Join(' ', segmentPairDto.TargetSegment ?? Array.Empty<string>()),
        };
}
