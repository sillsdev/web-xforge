using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using SIL.Scripture;

/// <summary>
/// This is a helper class that will assist in parsing various scripture range formats that are accepted by Serval.
/// </summary>
/// <remarks>
/// Further information can be found in the Serval documentation: <see cref="https://github.com/sillsdev/serval/wiki/Filtering-Paratext-Project-Data-with-a-Scripture-Range/" />
/// This uses the same regexes as SIL.Machine to verify the type of book range.
/// Our specific use case for parsing scripture ranges is different from SIL.Machine and therefore requires it's own implementation.
/// </remarks>
public class ScriptureRangeParser
{
    private HashSet<string> Books = [];
    private HashSet<string> BooksToRemove = [];
    private readonly Regex CommaSeparatedBooks = new Regex(
        @"^([A-Z\d]{3}|OT|NT)(, ?([A-Z\d]{3}|OT|NT))*$",
        RegexOptions.Compiled
    );

    private readonly Regex SemiColonSeparatedBooks = new Regex(
        @"^([A-Z\d]{3}|OT|NT)(; ?([A-Z\d]{3}|OT|NT))*$",
        RegexOptions.Compiled
    );

    private readonly Regex BookRange = new Regex(@"^-?[A-Z\d]{3}-[A-Z\d]{3}$", RegexOptions.Compiled);

    public IEnumerable<string> ParseScriptureRange(string scriptureRange)
    {
        if (string.IsNullOrWhiteSpace(scriptureRange))
        {
            return new HashSet<string>();
        }

        try
        {
            // Allow a single book as a range
            if (scriptureRange.Length == 3)
            {
                Books.Add(scriptureRange);
            }
            // Allow semi-colon separated HashSet
            else if (SemiColonSeparatedBooks.IsMatch(scriptureRange))
            {
                var booksHashSet = scriptureRange.Split([';'], StringSplitOptions.RemoveEmptyEntries);
                foreach (var book in booksHashSet)
                {
                    ProcessBook(book.ToUpperInvariant());
                }
            }
            // Allow comma separated HashSet
            else if (CommaSeparatedBooks.IsMatch(scriptureRange))
            {
                var booksHashSet = scriptureRange.Split([','], StringSplitOptions.RemoveEmptyEntries);
                foreach (var book in booksHashSet)
                {
                    ProcessBook(book.ToUpperInvariant());
                }
            }
        }
        catch (Exception ex)
        {
            // Handle any exceptions that may occur during parsing
            Console.WriteLine($"Error parsing scripture range: {ex.Message}");
        }

        // Remove any books that are marked for removal
        foreach (var book in BooksToRemove)
        {
            if (Books.Contains(book))
            {
                Books.Remove(book);
            }
        }
        return Books;
    }

    /// <summary>
    ///
    /// </summary>
    /// <param name="book">The book or range of books to process.</param>
    /// <returns>A HashSet of books that are part of the range.</returns>
    /// <remarks>
    /// A "book" may be a single book (GEN), a range of books (e.g. "GEN-LEV"), an entire testament (OT or NT),
    /// or marked to remove a book (NT;-REV).
    /// </remarks>
    private void ProcessBook(string book)
    {
        switch (book)
        {
            case "OT":
                AddAllBooksForTestament(book);
                break;
            case "NT":
                AddAllBooksForTestament(book);
                break;
            default:
                if (book.Length == 3)
                {
                    Books.Add(book);
                }
                else if (BookRange.IsMatch(book))
                {
                    AddAllBooksInRange(book);
                }
                else if (book.StartsWith('-'))
                {
                    BooksToRemove.Add(book[..'-']);
                }
                else
                {
                    throw new ArgumentException($"Invalid book range: {book}");
                }
                break;
        }
    }

    private void AddAllBooksInRange(string range)
    {
        string[] rangeParts = range.Split('-');
        // we should expect the first book to come before the second book (e.g. GEN-LEV) not the other way around (e.g. LEV-GEN)
        if (Array.IndexOf(Canon.AllBookIds, rangeParts[1]) > Array.IndexOf(Canon.AllBookIds, rangeParts[0]))
        {
            throw new ArgumentException($"Invalid book range: {range}");
        }

        string endBook = Canon.AllBookIds[Array.IndexOf(Canon.AllBookIds, rangeParts[1]) + 1];
        foreach (
            var book in Canon.AllBookIds.SkipWhile(book => book != rangeParts[0]).TakeWhile(book => book != endBook)
        )
        {
            Books.Add(book);
        }
    }

    private void AddAllBooksForTestament(string testment)
    {
        if (testment == "OT")
        {
            foreach (var book in (string[])Canon.AllBookIds.Where(Canon.IsBookOT))
            {
                Books.Add(book.ToUpperInvariant());
            }
        }
        else if (testment == "NT")
        {
            foreach (var book in (string[])Canon.AllBookIds.Where(Canon.IsBookNT))
            {
                Books.Add(book.ToUpperInvariant());
            }
        }
        else
        {
            throw new ArgumentException($"Invalid testament: {testment}");
        }
    }
}
