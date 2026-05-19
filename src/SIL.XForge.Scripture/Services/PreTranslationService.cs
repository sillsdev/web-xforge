#nullable disable warnings
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Paratext.Data;
using Serval.Client;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class PreTranslationService(
    IRepository<SFProjectSecret> projectSecrets,
    ITranslationEnginesClient translationEnginesClient
) : IPreTranslationService
{
    public static string GetTextId(int bookNum, int chapterNum) => $"{bookNum}_{chapterNum}";

    public static string GetTextId(int bookNum) => Canon.BookNumberToId(bookNum);

    /// <summary>
    /// Gets the pre-translations as USFM.
    /// </summary>
    /// <param name="sfProjectId">The SF project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. If 0, all chapters in the book are returned.</param>
    /// <param name="config">The draft USFM configuration.</param>":
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns></returns>
    /// <exception cref="DataNotFoundException">
    /// The project secret or pre-translation configuration was not found.
    /// </exception>
    public async Task<string> GetPreTranslationUsfmAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DraftUsfmConfig config,
        CancellationToken cancellationToken
    )
    {
        // Ensure we have the parameters to retrieve the pre-translation
        (string? translationEngineId, string? corpusId, string? parallelCorpusId, bool _) =
            await GetPreTranslationParametersAsync(sfProjectId);

        // Generate the paragraph marker and quote normalization behaviors
        PretranslationUsfmMarkerBehavior paragraphMarkerBehavior = config.ParagraphFormat switch
        {
            ParagraphBreakFormatOptions.Remove => PretranslationUsfmMarkerBehavior.Strip,
            ParagraphBreakFormatOptions.BestGuess => PretranslationUsfmMarkerBehavior.PreservePosition,
            ParagraphBreakFormatOptions.MoveToEnd => PretranslationUsfmMarkerBehavior.Preserve,
            _ => PretranslationUsfmMarkerBehavior.PreservePosition,
        };
        PretranslationNormalizationBehavior quoteNormalizationBehavior = config.QuoteFormat switch
        {
            QuoteStyleOptions.Denormalized => PretranslationNormalizationBehavior.Denormalized,
            QuoteStyleOptions.Normalized => PretranslationNormalizationBehavior.Normalized,
            _ => PretranslationNormalizationBehavior.Denormalized,
        };

        // Get the USFM
        string usfm;
        if (parallelCorpusId is not null)
        {
            usfm = await translationEnginesClient.GetPretranslatedUsfmAsync(
                id: translationEngineId,
                parallelCorpusId: parallelCorpusId,
                textId: GetTextId(bookNum),
                textOrigin: PretranslationUsfmTextOrigin.OnlyPretranslated,
                template: PretranslationUsfmTemplate.Source,
                paragraphMarkerBehavior: paragraphMarkerBehavior,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: quoteNormalizationBehavior,
                cancellationToken: cancellationToken
            );
        }
        else
        {
            // Retrieve the USFM from a legacy corpus
#pragma warning disable CS0612 // Type or member is obsolete
            usfm = await translationEnginesClient.GetCorpusPretranslatedUsfmAsync(
                id: translationEngineId,
                corpusId: corpusId,
                textId: GetTextId(bookNum),
                textOrigin: PretranslationUsfmTextOrigin.OnlyPretranslated,
                template: PretranslationUsfmTemplate.Source,
                paragraphMarkerBehavior: paragraphMarkerBehavior,
                embedBehavior: PretranslationUsfmMarkerBehavior.Strip,
                styleMarkerBehavior: PretranslationUsfmMarkerBehavior.Strip,
                quoteNormalizationBehavior: quoteNormalizationBehavior,
                cancellationToken: cancellationToken
            );
#pragma warning restore CS0612 // Type or member is obsolete
        }

        // Return the entire book
        if (chapterNum == 0)
        {
            return usfm;
        }

        // Return the chapter, if present
        if (
            ScrText.TrySplitIntoChapters(usfm, out List<string> chapters)
            && chapterNum <= chapters.Count
            && chapterNum >= 1
        )
        {
            return chapters[chapterNum - 1];
        }

        // Chapter not found
        return string.Empty;
    }

    /// <summary>
    /// Gets the required parameters from the project secret to retrieve the pre-translations.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <returns>
    /// The translation engine identifier, the corpus identifier, and whether to use Paratext verse references.
    /// </returns>
    /// <remarks>This can be mocked in unit tests.</remarks>
    /// <exception cref="DataNotFoundException">The pre-translation engine is not configured, or the project secret cannot be found.</exception>
    protected internal virtual async Task<(
        string translationEngineId,
        string? corpusId,
        string? parallelCorpusId,
        bool useParatextVerseRef
    )> GetPreTranslationParametersAsync(string sfProjectId)
    {
        // Load the target project secrets, so we can get the translation engine ID and corpus ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        string translationEngineId = projectSecret.ServalData?.PreTranslationEngineId;
        string? corpusId = null;
        string? parallelCorpusId = null;
        bool useParatextVerseRef = false;
        if (!string.IsNullOrWhiteSpace(projectSecret.ServalData?.ParallelCorpusIdForPreTranslate))
        {
            parallelCorpusId = projectSecret.ServalData.ParallelCorpusIdForPreTranslate;
            useParatextVerseRef = true;
        }
        else
        {
            // Legacy Serval Project
            corpusId = projectSecret
                .ServalData?.Corpora?.FirstOrDefault(c => c.Value.PreTranslate && !c.Value.AlternateTrainingSource)
                .Key;
            if (!string.IsNullOrWhiteSpace(corpusId))
            {
                useParatextVerseRef = projectSecret.ServalData.Corpora[corpusId].UploadParatextZipFile;
            }
        }

        if (
            string.IsNullOrWhiteSpace(translationEngineId)
            || (string.IsNullOrWhiteSpace(corpusId) && string.IsNullOrWhiteSpace(parallelCorpusId))
        )
        {
            throw new DataNotFoundException("The pre-translation engine is not configured.");
        }

        return (translationEngineId, corpusId, parallelCorpusId, useParatextVerseRef);
    }
}
