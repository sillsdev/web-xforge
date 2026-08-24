using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace SIL.XForge.Scripture.Models;

public static class ScriptureRangeParserExtensions
{
    public static bool TryGetChapters(
        this ScriptureRangeParser scriptureRangeParser,
        string chapterSelections,
        [NotNullWhen(true)] out Dictionary<string, List<int>>? chapters
    )
    {
        try
        {
            chapters = scriptureRangeParser.GetChapters(chapterSelections);
            return true;
        }
        catch (ArgumentException)
        {
            chapters = null;
            return false;
        }
    }
}
