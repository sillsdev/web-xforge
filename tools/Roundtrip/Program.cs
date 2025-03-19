using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using Microsoft.Extensions.Logging;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.Users;
using Roundtrip;
using SIL.Converters.Usj;
using SIL.XForge.Scripture.Services;

// The first argument must be the path containing the zip files or projects
if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]) || !Path.Exists(args[0]))
{
    Console.WriteLine("You must specify a valid path to the projects or resources");
    return;
}

// See if we are outputting the round tripped SFM files when they differ
bool outputSfmFiles = args.Length > 1 && args[1] == "--output-sfm";

// Setup Paratext
RegistrationInfo.Implementation = new TestRegistrationInfo();
ICUDllLocator.Initialize();
WritingSystemRepository.Initialize();
ScrTextCollection.Initialize();
using var scrText = new DummyScrText();
ScrTextCollection.Add(scrText);
ILoggerFactory loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());

// Iterate over every zip file in the directory
foreach (string zipFilePath in Directory.EnumerateFiles(args[0], "*.zip", SearchOption.AllDirectories))
{
    await using FileStream zipFileStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read);
    using ZipArchive archive = new ZipArchive(zipFileStream, ZipArchiveMode.Read);
    foreach (ZipArchiveEntry entry in archive.Entries)
    {
        if (
            entry.Name.EndsWith(".usfm", StringComparison.OrdinalIgnoreCase)
            || entry.Name.EndsWith(".sfm", StringComparison.OrdinalIgnoreCase)
        )
        {
            // Load the USFM
            await using Stream entryStream = entry.Open();
            using StreamReader reader = new StreamReader(entryStream);
            string usfm = await reader.ReadToEndAsync();
            UsjRoundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath));
            DeltaRoundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath));
        }
    }
}

// Iterate over every SFM file in the directory.
// This is helpful to roundtrip c:\My Paratext 9 Projects or /var/lib/scriptureforge/sync
foreach (string sfmFile in Directory.EnumerateFiles(args[0], "*.sfm", SearchOption.AllDirectories))
{
    // Load the USFM
    await using Stream entryStream = File.OpenRead(sfmFile);
    using StreamReader reader = new StreamReader(entryStream);
    string usfm = await reader.ReadToEndAsync();
    UsjRoundtrip(usfm, Path.GetFileName(sfmFile), Path.GetFullPath(sfmFile));
    DeltaRoundtrip(usfm, Path.GetFileName(sfmFile), Path.GetFullPath(sfmFile));
}

return;

void DeltaRoundtrip(string usfm, string fileName, string path)
{
    // Normalize the USFM
    string normalizedUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        usfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Convert the USFM to USX
    XmlDocument usx = UsfmToUsx.ConvertToXmlDocument(scrText, scrText.DefaultStylesheet, normalizedUsfm);

    // Convert the USX to USFM to handle any variance from ParatextData
    UsxFragmenter.FindFragments(
        scrText.DefaultStylesheet,
        usx.CreateNavigator(),
        XPathExpression.Compile("*[false()]"),
        out string cleanedUsfm,
        allowInvisibleChars: false
    );

    // Normalize the cleaned USFM, to get the expected USFM
    string expectedUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        cleanedUsfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Convert the USX to Deltas
    DeltaUsxMapper mapper = new DeltaUsxMapper(
        new GuidService(),
        loggerFactory.CreateLogger<DeltaUsxMapper>(),
        new ConsoleExceptionHandler()
    );
    using XmlNodeReader nodeReader = new XmlNodeReader(usx);
    // ReSharper disable once MethodHasAsyncOverload
    nodeReader.MoveToContent();
    XDocument bookUsx = XDocument.Load(nodeReader);
    List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(bookUsx)];

    // Convert the deltas to USX
    XDocument actualUsx = mapper.ToUsx(bookUsx, chapterDeltas);

    // Convert the USX to USFM
    UsxFragmenter.FindFragments(
        scrText.DefaultStylesheet,
        actualUsx.CreateNavigator(),
        XPathExpression.Compile("*[false()]"),
        out string convertedUsfm,
        allowInvisibleChars: false
    );

    // Normalize the USFM
    string actualUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        convertedUsfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Log the file name and path if the USFM does not match
    if (actualUsfm != expectedUsfm)
    {
        Console.WriteLine($"USFM to Delta mismatch in {fileName} in {path}");
        if (outputSfmFiles && Directory.CreateDirectory("output").Exists)
        {
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-actual" + Path.GetExtension(fileName)
                ),
                actualUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-expected" + Path.GetExtension(fileName)
                ),
                expectedUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-original" + Path.GetExtension(fileName)
                ),
                usfm
            );
        }
    }
}

void UsjRoundtrip(string usfm, string fileName, string path)
{
    // Normalize the USFM
    string normalizedUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        usfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Convert the USFM to USX
    XmlDocument usx = UsfmToUsx.ConvertToXmlDocument(scrText, scrText.DefaultStylesheet, normalizedUsfm);

    // Convert the USX to USFM to handle any variance from ParatextData
    UsxFragmenter.FindFragments(
        scrText.DefaultStylesheet,
        usx.CreateNavigator(),
        XPathExpression.Compile("*[false()]"),
        out string cleanedUsfm,
        allowInvisibleChars: false
    );

    // Normalize the cleaned USFM, to get the expected USFM
    string expectedUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        cleanedUsfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Convert the USX to USJ
    Usj usj = UsxToUsj.UsxXmlDocumentToUsj(usx);

    // Convert the USJ to USX
    XmlDocument actualUsx = UsjToUsx.UsjToUsxXmlDocument(usj);

    // Convert the USX to USFM
    UsxFragmenter.FindFragments(
        scrText.DefaultStylesheet,
        actualUsx.CreateNavigator(),
        XPathExpression.Compile("*[false()]"),
        out string convertedUsfm,
        allowInvisibleChars: false
    );

    // Normalize the USFM
    string actualUsfm = UsfmToken.NormalizeUsfm(
        scrText.DefaultStylesheet,
        convertedUsfm,
        preserveWhitespace: false,
        scrText.RightToLeft,
        scrText
    );

    // Log the file name and path if the USFM does not match
    if (actualUsfm != expectedUsfm)
    {
        Console.WriteLine($"USFM to USJ mismatch in {fileName} in {path}");
        if (outputSfmFiles && Directory.CreateDirectory("output").Exists)
        {
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-actual" + Path.GetExtension(fileName)
                ),
                actualUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-expected" + Path.GetExtension(fileName)
                ),
                expectedUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    Path.GetFileNameWithoutExtension(fileName) + "-original" + Path.GetExtension(fileName)
                ),
                usfm
            );
        }
    }
}
