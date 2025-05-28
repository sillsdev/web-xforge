using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using ICSharpCode.SharpZipLib.Zip;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.Users;
using Roundtrip;
using SIL.Converters.Usj;
using SIL.XForge.Configuration;
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

// Set up the password provider
ConfigurationBuilder configurationBuilder = new ConfigurationBuilder();
IConfiguration configuration = configurationBuilder.AddUserSecrets<Program>().Build();
ParatextOptions? paratextOptions = configuration.GetSection("Paratext").Get<ParatextOptions>();
var passwordProvider = new ParatextZippedResourcePasswordProvider(paratextOptions);

// Iterate over every zip file in the directory
foreach (string zipFilePath in Directory.EnumerateFiles(args[0], "*.zip", SearchOption.AllDirectories))
{
    await using FileStream zipFileStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read);
    using ZipFile zipFile = new ZipFile(zipFileStream);
    bool noUsfmFiles = true;
    foreach (ZipEntry entry in zipFile)
    {
        if (
            entry.Name.EndsWith(".usfm", StringComparison.OrdinalIgnoreCase)
            || entry.Name.EndsWith(".sfm", StringComparison.OrdinalIgnoreCase)
        )
        {
            // Load the USFM
            await using Stream entryStream = zipFile.GetInputStream(entry);
            using StreamReader reader = new StreamReader(entryStream);
            string usfm = await reader.ReadToEndAsync();
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Delta);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usj);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usx);
            noUsfmFiles = false;
        }
    }

    // Warn if there are no USFM files in the resource
    if (noUsfmFiles)
    {
        Console.WriteLine($"No USFM files found in {zipFilePath}");
    }
}

// Iterate over every DBL resource file in the directory
// This is helpful to roundtrip C:\My Paratext 9 Projects\_Resources or /var/lib/scriptureforge/sync/_Resources
foreach (string zipFilePath in Directory.EnumerateFiles(args[0], "*.p8z", SearchOption.AllDirectories))
{
    // Open the zip file
    await using FileStream zipFileStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read);
    using ZipFile zipFile = new ZipFile(zipFileStream);
    zipFile.Password = passwordProvider.GetPassword();

    // Get the extension for the resource
    List<string> extensions = [".usfm", ".sfm"];
    foreach (ZipEntry entry in zipFile)
    {
        if (
            entry.Name.Equals("settings.xml", StringComparison.OrdinalIgnoreCase)
            || entry.Name.EndsWith(".ssf", StringComparison.OrdinalIgnoreCase)
        )
        {
            // Load the XML
            await using Stream entryStream = zipFile.GetInputStream(entry);
            XDocument doc = await XDocument.LoadAsync(entryStream, LoadOptions.None, CancellationToken.None);

            // Get the file extension
            string? postPart = doc.Root?.Element("Naming")?.Attribute("PostPart")?.Value;
            if (!string.IsNullOrWhiteSpace(postPart))
            {
                extensions.Add(postPart);
            }
        }
    }

    // Iterate over each USFM file in the zip file
    bool noUsfmFiles = true;
    foreach (ZipEntry entry in zipFile)
    {
        if (extensions.Any(extension => entry.Name.EndsWith(extension, StringComparison.OrdinalIgnoreCase)))
        {
            // Load the USFM
            await using Stream entryStream = zipFile.GetInputStream(entry);
            using StreamReader reader = new StreamReader(entryStream);
            string usfm = await reader.ReadToEndAsync();
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Delta);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usj);
            Roundtrip(usfm, entry.Name, Path.GetFileName(zipFilePath), RoundtripMethod.Usx);
            noUsfmFiles = false;
        }
    }

    // Warn if there are no USFM files in the resource
    if (noUsfmFiles)
    {
        Console.WriteLine($"No USFM files found in {zipFilePath}");
    }
}

// Iterate over every SFM file in the directory.
// This is helpful to roundtrip C:\My Paratext 9 Projects or /var/lib/scriptureforge/sync
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
                Path.Join(
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
                Path.Join("output", $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-usj.json"),
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

        // Output the USX if requested
        if (outputAllFiles)
        {
            actualUsx.Save(
                Path.Join("output", $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-usx.xml")
            );
        }
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
                Path.Join(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-actual{Path.GetExtension(fileName)}"
                ),
                actualUsfm
            );
            File.WriteAllText(
                Path.Join(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-expected{Path.GetExtension(fileName)}"
                ),
                expectedUsfm
            );
            File.WriteAllText(
                Path.Join(
                    "output",
                    $"{Path.GetFileName(path)}-{Path.GetFileNameWithoutExtension(fileName)}-original{Path.GetExtension(fileName)}"
                ),
                usfm
            );
        }
    }
}
