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
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class PreTranslationService : IPreTranslationService
{
    private readonly IRepository<SFProjectSecret> _projectSecrets;
    private readonly ITranslationEnginesClient _translationEnginesClient;

    public PreTranslationService(
        IRepository<SFProjectSecret> projectSecrets,
        ITranslationEnginesClient translationEnginesClient
    )
    {
        _projectSecrets = projectSecrets;
        _translationEnginesClient = translationEnginesClient;
    }

    public static string GetTextId(int bookNum, int chapterNum) => $"{bookNum}_{chapterNum}";

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
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have the parameters to retrieve the pre-translation
        string translationEngineId = projectSecret.ServalData?.PreTranslationEngineId;
        string corpusId = projectSecret.ServalData?.Corpora.FirstOrDefault(c => c.Value.PreTranslate).Key;
        if (string.IsNullOrWhiteSpace(translationEngineId) || string.IsNullOrWhiteSpace(corpusId))
        {
            throw new DataNotFoundException("The pre-translation engine is not configured.");
        }

        // Get the pre-translation data from Serval
        string textId = GetTextId(bookNum, chapterNum);
        foreach (
            Pretranslation preTranslation in await _translationEnginesClient.GetAllPretranslationsAsync(
                translationEngineId,
                corpusId,
                textId,
                cancellationToken
            )
        )
        {
            // A reference will be in the format "40_1:verse_001_002"
            string reference = preTranslation.Refs.FirstOrDefault();
            if (string.IsNullOrWhiteSpace(reference))
            {
                continue;
            }

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
            if (!reference.StartsWith("verse_"))
            {
                continue;
            }

            referenceParts = reference.Split('_', StringSplitOptions.RemoveEmptyEntries);
            if (
                referenceParts.Length < 3
                || !int.TryParse(referenceParts[1], out int refChapterNum)
                || refChapterNum != chapterNum
            )
            {
                continue;
            }

            // Get the reference in the form MAT 1:2
            string verse = referenceParts[2];
            VerseRef verseRef = new VerseRefData(bookNum, chapterNum, verse).ToVerseRef();
            reference = verseRef.Text;

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
                preTranslations.First(p => p.Reference == reference).Translation += " " + translation;
            }
            else
            {
                preTranslations.Add(new PreTranslation { Reference = reference, Translation = translation });
            }
        }

        return preTranslations.ToArray();
    }
}
