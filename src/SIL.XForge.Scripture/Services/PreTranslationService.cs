using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Paratext.Data;
using Serval.Client;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class PreTranslationService(
    IRepository<SFProjectSecret> projectSecrets,
    IRealtimeService realtimeService,
    ITranslationEnginesClient translationEnginesClient
) : IPreTranslationService
{
    public static string GetTextId(int bookNum, int chapterNum) => $"{bookNum}_{chapterNum}";

    public static string GetTextId(int bookNum) => Canon.BookNumberToId(bookNum);

    public async Task<PreTranslation[]> GetPreTranslationsAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        List<PreTranslation> preTranslations = [];

        // Ensure we have the parameters to retrieve the pre-translation
        (string? translationEngineId, string corpusId, bool useParatextVerseRef) =
            await GetPreTranslationParametersAsync(sfProjectId);

        // Get the pre-translation data from Serval
        string textId = useParatextVerseRef ? GetTextId(bookNum) : GetTextId(bookNum, chapterNum);
        foreach (
            Pretranslation preTranslation in await translationEnginesClient.GetAllPretranslationsAsync(
                translationEngineId,
                corpusId,
                textId,
                cancellationToken
            )
        )
        {
            // A reference will be in one of the formats:
            // FileFormat.Text: "40_1:verse_001_002"
            // FileFormat.Paratext: "MAT 1:2" or "MAT 1:2/1:p"
            string reference = preTranslation.Refs.FirstOrDefault();
            if (string.IsNullOrWhiteSpace(reference))
            {
                continue;
            }

            // Only return this chapter if we are using the Paratext verse ref format
            if (useParatextVerseRef)
            {
                // The file format is FileFormat.Paratext

                // If there is a forward slash, in the reference, the first half is the verse reference
                if (reference.Contains('/', StringComparison.OrdinalIgnoreCase))
                {
                    reference = reference.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                }

                // Ensure we have a valid verse reference and it is for this chapter
                if (!VerseRef.TryParse(reference, out VerseRef verseRef) || verseRef.ChapterNum != chapterNum)
                {
                    continue;
                }

                // Conform the reference to the format the frontend expects
                reference = $"verse_{verseRef.ChapterNum}_{verseRef.Verse}";
            }
            else
            {
                // The file format is FileFormat.Text

                // Check for then remove the textId from the reference
                string[] referenceParts;
                if (reference.Contains(':'))
                {
                    referenceParts = reference.Split(':', StringSplitOptions.RemoveEmptyEntries);
                    if (referenceParts.Length != 2)
                    {
                        continue;
                    }

                    // The first part must be the text id
                    if (referenceParts.First() != textId)
                    {
                        continue;
                    }

                    // Remove the reference part
                    reference = referenceParts.Last();
                }

                // Ensure this is for a verse - we do not support headings and metadata
                referenceParts = reference.Split('_', StringSplitOptions.RemoveEmptyEntries);
                if (reference.StartsWith("verse_"))
                {
                    // The reference is in the form verse_001_001 or verse_001_001_001
                    if (
                        referenceParts.Length < 3
                        || !int.TryParse(referenceParts[1], out int refChapterNum)
                        || refChapterNum != chapterNum
                    )
                    {
                        continue;
                    }

                    // Get the reference in the form verse_1_1, if we did not send all segments
                    // This will allow us to combine multiple paragraphs or poetry lines in the same verse
                    string verse = referenceParts[2];
                    VerseRef verseRef = new VerseRefData(bookNum, chapterNum, verse).ToVerseRef();
                    reference = $"verse_{verseRef.ChapterNum}_{verseRef.Verse}";
                }
                else
                {
                    // The verse reference does not begin with "_verse"
                    continue;
                }
            }

            // Build the translation string
            StringBuilder sb = new StringBuilder();
            string[] words = preTranslation.Translation.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < words.Length; i++)
            {
                string word = words[i];

                // Add a preceding space if this is not the first word or punctuation
                if (i > 0 && (word.Length != 1 || !char.IsPunctuation(word.First())))
                {
                    sb.Append(' ');
                }

                sb.Append(word);
            }

            // Remove the last space and get the translation
            string translation = sb.ToString().TrimEnd();

            // Add the pre-translation, or update if this is a segment of it
            if (preTranslations.Any(p => p.Reference == reference))
            {
                preTranslations.First(p => p.Reference == reference).Translation += translation.TrimEnd() + " ";
            }
            else
            {
                preTranslations.Add(
                    new PreTranslation { Reference = reference, Translation = translation.TrimEnd() + " " }
                );
            }
        }

        return [.. preTranslations];
    }

    /// <summary>
    /// Gets the pre-translations as USFM.
    /// </summary>
    /// <param name="sfProjectId">The SF project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="chapterNum">The chapter number. If 0, all chapters in the book are returned.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns></returns>
    /// <exception cref="DataNotFoundException">
    /// The project secret or pre-translation configuration was not found.
    /// </exception>
    public async Task<string> GetPreTranslationUsfmAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Ensure we have the parameters to retrieve the pre-translation
        (string? translationEngineId, string corpusId, bool _) = await GetPreTranslationParametersAsync(sfProjectId);

        // Get the USFM
        string usfm = await translationEnginesClient.GetPretranslatedUsfmAsync(
            id: translationEngineId,
            corpusId: corpusId,
            textId: GetTextId(bookNum),
            textOrigin: PretranslationUsfmTextOrigin.OnlyPretranslated,
            template: PretranslationUsfmTemplate.Source,
            cancellationToken: cancellationToken
        );

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

    public async Task UpdatePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken)
    {
        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure we have the parameters to retrieve the pre-translation
        (string? translationEngineId, string corpusId, bool useParatextVerseRef) =
            await GetPreTranslationParametersAsync(sfProjectId);

        // Get all the pre-translations and update the chapters
        Dictionary<int, HashSet<int>> bookChapters = [];
        foreach (
            Pretranslation preTranslation in await translationEnginesClient.GetAllPretranslationsAsync(
                translationEngineId,
                corpusId,
                textId: null,
                cancellationToken
            )
        )
        {
            // Get the book and chapter number
            int bookNum;
            int chapterNum;
            if (useParatextVerseRef)
            {
                // The file format is FileFormat.Paratext
                // We need to get the chapter number from the reference, as the textId is the book code
                // A reference will be in the format: MAT 1:2 or MAT 1:2/1:p
                string reference = preTranslation.Refs.FirstOrDefault() ?? string.Empty;

                // If there is a forward slash, in the reference, the first half is the verse reference
                if (reference.Contains('/', StringComparison.OrdinalIgnoreCase))
                {
                    reference = reference.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                }

                // Ensure we have a valid verse reference and it is for this chapter
                if (string.IsNullOrWhiteSpace(reference) || !VerseRef.TryParse(reference, out VerseRef verseRef))
                {
                    continue;
                }

                bookNum = verseRef.BookNum;
                chapterNum = verseRef.ChapterNum;
            }
            else
            {
                // The textId will be in the format bookNum_chapterNum
                string[] textIdParts = preTranslation.TextId.Split('_', StringSplitOptions.RemoveEmptyEntries);
                if (
                    textIdParts.Length != 2
                    || !int.TryParse(textIdParts[0], out bookNum)
                    || !int.TryParse(textIdParts[1], out chapterNum)
                )
                {
                    continue;
                }
            }

            // Store the book number and chapter number
            if (bookChapters.TryGetValue(bookNum, out HashSet<int> value))
            {
                // The HashSet stops duplicate chapter numbers for this book
                value.Add(chapterNum);
            }
            else
            {
                bookChapters.Add(bookNum, [chapterNum]);
            }
        }

        // Update the project chapters
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            for (int i = 0; i < projectDoc.Data.Texts.Count; i++)
            {
                for (int j = 0; j < projectDoc.Data.Texts[i].Chapters.Count; j++)
                {
                    // As we will use these in a closure, instantiate to stop out of scope modification
                    int textIndex = i;
                    int chapterIndex = j;
                    bool hasDraft =
                        bookChapters.TryGetValue(projectDoc.Data.Texts[i].BookNum, out HashSet<int> chapters)
                        && chapters.Contains(projectDoc.Data.Texts[i].Chapters[chapterIndex].Number);

                    // Update the has draft value for the chapter
                    op.Set(p => p.Texts[textIndex].Chapters[chapterIndex].HasDraft, hasDraft);
                    op.Unset(p => p.Texts[textIndex].Chapters[chapterIndex].DraftApplied);
                }
            }
        });
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
        string corpusId,
        bool useParatextVerseRef
    )> GetPreTranslationParametersAsync(string sfProjectId)
    {
        // Load the target project secrets, so we can get the translation engine ID and corpus ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        string translationEngineId = projectSecret.ServalData?.PreTranslationEngineId;
        string corpusId;
        bool useParatextVerseRef = false;
        if (!string.IsNullOrWhiteSpace(projectSecret.ServalData?.ParallelCorpusIdForPreTranslate))
        {
            corpusId = projectSecret.ServalData.ParallelCorpusIdForPreTranslate;
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

        if (string.IsNullOrWhiteSpace(translationEngineId) || string.IsNullOrWhiteSpace(corpusId))
        {
            throw new DataNotFoundException("The pre-translation engine is not configured.");
        }

        return (translationEngineId, corpusId, useParatextVerseRef);
    }
}
