using System.Text;
using System.Xml;
using NLipsum.Core;
using Paratext.Data.ProjectComments;
using SIL.Scripture;

Console.WriteLine("Paratext Comment Generator");
Console.WriteLine();
Console.WriteLine("Usage: CommentGenerator /ot /nt /dc \"Paratext Username\"");
Console.WriteLine();

// Get the username from the command line or the environment
string userName = args.Any(a => !(a.StartsWith('-') || a.StartsWith('/') || a.StartsWith('\\')))
    ? args.First(a => !(a.StartsWith('-') || a.StartsWith('/') || a.StartsWith('\\')))
    : Environment.UserName;

// Clean the username to be in a filename
userName = string.Join(string.Empty, userName.Split(Path.GetInvalidFileNameChars()));

string fileName = $"Notes_{userName}.xml";
Console.Write($"Generating: {fileName}...");

// Get the books to generate comments for from the command line arguments
var bookNumbers = new List<int>();

// Add the Old Testament
if (args.Any(a => a is "\\ot" or "-ot" or "/ot"))
{
    bookNumbers.AddRange(Canon.AllBookNumbers.Where(Canon.IsBookOT));
}

// Add the New Testament
if (args.Any(a => a is "\\nt" or "-nt" or "/ot"))
{
    bookNumbers.AddRange(Canon.AllBookNumbers.Where(Canon.IsBookNT));
}

// Add the Deuterocanonicals
if (args.Any(a => a is "\\dc" or "-dc" or "/dc"))
{
    bookNumbers.AddRange(Canon.AllBookNumbers.Where(Canon.IsBookDC));
}

// Add OT and NT if no arguments specified
if (!bookNumbers.Any())
{
    bookNumbers.AddRange(Canon.AllBookNumbers.Where(Canon.IsBookOTNT));
}

// We will generate lorem ipsum text for the comments
var generator = new LipsumGenerator();

// Create the XML file
var settings = new XmlWriterSettings
{
    Indent = true,
    OmitXmlDeclaration = false,
    Encoding = Encoding.UTF8,
};
using FileStream fs = new FileStream(fileName, FileMode.Create);
using XmlWriter writer = XmlWriter.Create(fs, settings);
writer.WriteStartDocument();
writer.WriteStartElement("CommentList");

// Generate an XML comment for every verse of every chapter of every book
foreach (int bookNum in bookNumbers)
{
    VerseRef verseRef = new VerseRef(ScrVers.English);
    verseRef.Parse($"{Canon.BookNumberToId(bookNum)} 1:0");
    BookSet book = new BookSet(bookNum);
    while (verseRef.NextVerse(book, skipExcluded: true))
    {
        if (verseRef.VerseNum == 0)
        {
            continue;
        }

        writer.WriteStartElement("Comment");
        writer.WriteAttributeString("Thread", Comment.CreateThreadId());
        writer.WriteAttributeString("User", userName);
        writer.WriteAttributeString("VerseRef", verseRef.ToString());
        writer.WriteAttributeString("Language", "en");
        writer.WriteAttributeString("Date", DateTimeOffset.Now.ToString("o"));
        writer.WriteElementString("SelectedText", null);
        writer.WriteElementString("StartPosition", "0");
        writer.WriteElementString("ContextBefore", $"\\v {verseRef.VerseNum}");
        writer.WriteElementString("ContextAfter", null);
        writer.WriteStartElement("Status");
        writer.WriteFullEndElement(); // Status
        writer.WriteStartElement("Type");
        writer.WriteFullEndElement(); // Type
        writer.WriteElementString("ConflictType", null);
        writer.WriteElementString("Verse", null);
        writer.WriteElementString("ReplyToUser", null);
        writer.WriteElementString("HideInTextWindow", "false");
        writer.WriteElementString("Contents", generator.GenerateSentences(1).First());

        writer.WriteEndElement(); // Comment
    }
}

writer.WriteEndElement(); // CommentList
writer.WriteEndDocument();
writer.Flush();
writer.Close();

Console.WriteLine("Done!");
Console.WriteLine("Next Step: Copy this file to your Paratext project directory, and sync in Paratext.");
