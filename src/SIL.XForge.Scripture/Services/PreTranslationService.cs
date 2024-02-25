using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Serval.Client;
using SIL.Machine.Corpora;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

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
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        List<PreTranslation> preTranslations = new List<PreTranslation>();

        // Load the target project secrets, so we can get the translation engine ID and corpus ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure we have the parameters to retrieve the pre-translation
        string translationEngineId = projectSecret.ServalData?.PreTranslationEngineId;
        string corpusId = projectSecret.ServalData?.Corpora.FirstOrDefault(c => c.Value.PreTranslate).Key;
        if (string.IsNullOrWhiteSpace(translationEngineId) || string.IsNullOrWhiteSpace(corpusId))
        {
            throw new DataNotFoundException("The pre-translation engine is not configured.");
        }

        // Get the pre-translation data from Serval
        bool useParatextVerseRef = projectSecret.ServalData.Corpora[corpusId].UploadParatextZipFile;
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
            // FileFormat.Paratext: "MAT 1:2"
            string reference = preTranslation.Refs.FirstOrDefault();
            if (string.IsNullOrWhiteSpace(reference))
            {
                continue;
            }

            // Only return this chapter if we are using the Paratext verse ref format
            if (useParatextVerseRef)
            {
                // The file format is FileFormat.Paratext

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
                    if (!project.TranslateConfig.DraftConfig.SendAllSegments)
                    {
                        string verse = referenceParts[2];
                        VerseRef verseRef = new VerseRefData(bookNum, chapterNum, verse).ToVerseRef();
                        reference = $"verse_{verseRef.ChapterNum}_{verseRef.Verse}";
                    }
                }

                // Parse the reference for non-verse segments, if we sent them for pre-translation
                if (project.TranslateConfig.DraftConfig.SendAllSegments)
                {
                    // The reference is in the format abc_001, abc_001_001, etc. Convert it to the format abc_1 or abc_1_1
                    reference = string.Join(
                        '_',
                        referenceParts.Select(part => int.TryParse(part, out int number) ? number.ToString() : part)
                    );
                }
                else if (!reference.StartsWith("verse_"))
                {
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
            sb.TrimEnd();
            string translation = sb.ToString();

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

        return preTranslations.ToArray();
    }
}
