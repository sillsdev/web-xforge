using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
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

// See if we are to output all created files (used to compare how much a change will affect all projects)
bool outputAllFiles = args.Length > 1 && args[1] == "--output-all";
if (outputAllFiles)
{
    Directory.CreateDirectory("output");
}

// Setup Paratext
RegistrationInfo.Implementation = new TestRegistrationInfo();
ICUDllLocator.Initialize();
WritingSystemRepository.Initialize();
ScrTextCollection.Initialize();
using var scrText = new DummyScrText(useFakeStylesheet: false);
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
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Delta);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usj);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usx);
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
    Roundtrip(usfm, Path.GetFileName(sfmFile), Path.GetFullPath(sfmFile), RoundtripMethod.Delta);
    Roundtrip(usfm, Path.GetFileName(sfmFile), Path.GetFullPath(sfmFile), RoundtripMethod.Usj);
    Roundtrip(usfm, Path.GetFileName(sfmFile), Path.GetFullPath(sfmFile), RoundtripMethod.Usx);
}

return;

void Roundtrip(string usfm, string fileName, string path, RoundtripMethod roundtripMethod)
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

    XDocument actualUsx;
    if (roundtripMethod == RoundtripMethod.Delta)
    {
        // Convert the USX to Deltas
        DeltaUsxMapper mapper = new DeltaUsxMapper(
            new SequentialGuidService(),
            loggerFactory.CreateLogger<DeltaUsxMapper>(),
            new ConsoleExceptionHandler()
        );
        using XmlNodeReader nodeReader = new XmlNodeReader(usx);
        // ReSharper disable once MethodHasAsyncOverload
        nodeReader.MoveToContent();
        XDocument bookUsx = XDocument.Load(nodeReader);
        List<ChapterDelta> chapterDeltas = [.. mapper.ToChapterDeltas(bookUsx)];

        // Output the delta if requested
        if (outputAllFiles)
        {
            File.WriteAllText(
                Path.Combine(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-delta.json"
                ),
                JsonConvert.SerializeObject(chapterDeltas, Newtonsoft.Json.Formatting.Indented)
            );
        }

        // Convert the deltas to USX
        actualUsx = mapper.ToUsx(bookUsx, chapterDeltas);
    }
    else if (roundtripMethod == RoundtripMethod.Usj)
    {
        // Convert the USX to USJ
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(usx);

        // Output the USJ if requested
        if (outputAllFiles)
        {
            File.WriteAllText(
                Path.Combine(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-usj.json"
                ),
                JsonConvert.SerializeObject(usj, Newtonsoft.Json.Formatting.Indented)
            );
        }

        // Convert the USJ to USX
        actualUsx = UsjToUsx.UsjToUsxXDocument(usj);
    }
    else if (roundtripMethod == RoundtripMethod.Usx)
    {
        // Convert the XmlDocument to an XDocument
        using XmlNodeReader nodeReader = new XmlNodeReader(usx);
        nodeReader.MoveToContent();
        actualUsx = XDocument.Load(nodeReader);
    }
    else
    {
        throw new ArgumentOutOfRangeException(nameof(roundtripMethod));
    }

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
        Console.WriteLine($"USFM to {roundtripMethod} mismatch in {fileName} in {path}");
        if (outputSfmFiles && Directory.CreateDirectory("output").Exists)
        {
            File.WriteAllText(
                Path.Combine(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-actual{Path.GetExtension(fileName)}"
                ),
                actualUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-expected{Path.GetExtension(fileName)}"
                ),
                expectedUsfm
            );
            File.WriteAllText(
                Path.Combine(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-original{Path.GetExtension(fileName)}"
                ),
                usfm
            );
        }
    }
}
