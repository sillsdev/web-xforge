using System.IO;
using System.Linq;
using System.Text;
using NUnit.Framework;
using Paratext.Data.ProjectComments;
using Paratext.Data.Users;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class FileSystemServiceTests
{
    [Test]
    public void WriteXmlFile_WritesBom()
    {
        var env = new TestEnvironment();
        using MemoryStream stream = new MemoryStream();
        CommentList data = [];

        // SUT
        env.Service.WriteXmlFile(stream, data);

        // Get the first three bytes
        stream.Position = 0;
        byte[] bytes = new byte[3];
        int count = stream.Read(bytes, 0, 3);

        // Verify the BOM
        Assert.AreEqual(3, count);
        Assert.AreEqual(0xEF, bytes[0]);
        Assert.AreEqual(0xBB, bytes[1]);
        Assert.AreEqual(0xBF, bytes[2]);
    }

    [Test]
    public void WriteXmlFile_WritesAnEmptyCommentList()
    {
        var env = new TestEnvironment();
        using MemoryStream stream = new MemoryStream();
        CommentList data = [];
        string xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n";
        xml += "<CommentList />";

        // Get the XML as a byte array with BOM
        Encoding encoding = new UTF8Encoding(true);
        byte[] expected = [.. encoding.GetPreamble().Concat(encoding.GetBytes(xml))];

        // SUT
        env.Service.WriteXmlFile(stream, data);
        byte[] actual = stream.ToArray();
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void WriteXmlFile_WritesComments()
    {
        var env = new TestEnvironment();
        using MemoryStream stream = new MemoryStream();

        // Setup data for the CommentList and XML
        const string thread = "abc12345";
        const string user = "Test User";
        const string verseRefStr = "ROM 1:1";
        const string language = "en";
        const string date = "2023-02-01T13:14:15.5034142+12:00";
        const string selectedText = "Paul";
        const int startPosition = 5;
        const string contextBefore = @"\v 1 ";
        const string contextAfter = ", a servant";
        const string verse =
            @"\v 1 Paul, a servant of Jesus Christ, called to be an apostle, separated unto the gospel of God,";
        const bool hideInTextWindow = false;
        const string contents = "Plain Text";

        // Set up the Comment List
        CommentList data =
        [
            new Comment(new DummyParatextUser(user))
            {
                Thread = thread,
                VerseRefStr = verseRefStr,
                Language = language,
                Date = date,
                SelectedText = selectedText,
                StartPosition = startPosition,
                ContextBefore = contextBefore,
                ContextAfter = contextAfter,
                Verse = verse,
                ReplyToUser = string.Empty,
                HideInTextWindow = false,
            },
        ];
        data.First().AddTextToContent(contents, false);

        // Setup the XML data for comparison
        string xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n";
        xml += "<CommentList>\r\n";
        xml += $"  <Comment Thread=\"{thread}\" User=\"{user}\" VerseRef=\"{verseRefStr}\" Language=\"{language}\"";
        xml += $" Date=\"{date}\">\r\n";
        xml += $"    <SelectedText>{selectedText}</SelectedText>\r\n";
        xml += $"    <StartPosition>{startPosition}</StartPosition>\r\n";
        xml += $"    <ContextBefore>{contextBefore}</ContextBefore>\r\n";
        xml += $"    <ContextAfter>{contextAfter}</ContextAfter>\r\n";
        xml += "    <Status></Status>\r\n";
        xml += "    <Type></Type>\r\n";
        xml += "    <ConflictType />\r\n";
        xml += $"    <Verse>{verse}</Verse>\r\n";
        xml += "    <ReplyToUser />\r\n";
        xml += $"    <HideInTextWindow>{hideInTextWindow.ToString().ToLowerInvariant()}</HideInTextWindow>\r\n";
        xml += "    <Contents>\r\n";
        xml += $"      <p>{contents}</p>\r\n";
        xml += "    </Contents>\r\n";
        xml += "  </Comment>\r\n";
        xml += "</CommentList>";

        // Get the XML as a byte array with BOM
        Encoding encoding = new UTF8Encoding(true);
        byte[] expected = [.. encoding.GetPreamble().Concat(encoding.GetBytes(xml))];

        // SUT
        env.Service.WriteXmlFile(stream, data);
        byte[] actual = stream.ToArray();
        Assert.AreEqual(expected, actual);
    }

    private class TestEnvironment
    {
        public IFileSystemService Service { get; } = new FileSystemService();
    }
}
