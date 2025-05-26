using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.Repository;
using SIL.Scripture;

#nullable enable

Console.WriteLine("Paratext Commit Generator");
Console.WriteLine();

if (args.Length < 4)
{
    Console.WriteLine("This will generate 200 commits in the specified repository alternating between two files");
    Console.WriteLine();
    Console.WriteLine("Usage: dotnet run project_name file_to_commit first_version second_version");
    Console.WriteLine();
    Console.WriteLine(
        "For example: dotnet run TDT 642JNTDT.SFM \"C:\\My Paratext 9 Projects\\MP1\\642JNMP1.SFM\""
            + " \"C:\\My Paratext 9 Projects\\BSB\\642JNBSB.SFM\""
    );
    Console.WriteLine(
        "If on Linux, set the PARATEXT_PROJECTS environment variable to your Paratext project directory."
    );
    Console.WriteLine();
    return;
}

string projectName = args[0];
string fileToCommit = args[1];
string firstVersionFileName = args[2];
string secondVersionFileName = args[3];

// Load the first and second versions of the file
string firstVersion = await File.ReadAllTextAsync(firstVersionFileName);
string secondVersion = await File.ReadAllTextAsync(secondVersionFileName);

// Set up Mercurial
string customHgPath = Environment.GetEnvironmentVariable("HG_PATH") ?? "/usr/local/bin/hg";
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    customHgPath = Path.GetExtension(customHgPath.ToLowerInvariant()) != ".exe" ? customHgPath + ".exe" : customHgPath;
}

if (!File.Exists(customHgPath))
{
    Console.WriteLine($"Error: Could not find hg executable at {customHgPath}. Please install hg 4.7 or greater.");
    return;
}

string? assemblyDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
if (string.IsNullOrWhiteSpace(assemblyDirectory))
{
    Console.WriteLine("The assembly directory could not be determined.");
    return;
}

string hgMerge = Path.Join(assemblyDirectory, "ParatextMerge.py");
Hg.Default = new Hg(customHgPath, hgMerge, assemblyDirectory);

// Setup Paratext
ICUDllLocator.Initialize();
WritingSystemRepository.Initialize();
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
ScrTextCollection.Initialize(Environment.GetEnvironmentVariable("PARATEXT_PROJECTS"));
ScrTextCollection.RefreshScrTexts(allowMigration: false);

using ScrText scrText = ScrTextCollection.Get(projectName);
for (int i = 0; i < 100; i++)
{
    // Write the first version
    int bookNum = scrText.Settings.GetBookNumberFromFilename(fileToCommit);
    scrText.PutText(bookNum, 0, false, firstVersion, null);
    VersionedText versionedText = VersioningManager.Get(scrText);
    versionedText.Commit(
        $"Update to {Canon.BookNumberToId(bookNum)} by CommitGenerator",
        dblRevisionNumber: null,
        forceCommit: false
    );

    // Write the second version
    scrText.PutText(bookNum, 0, false, secondVersion, null);
    versionedText = VersioningManager.Get(scrText);
    versionedText.Commit(
        $"Update to {Canon.BookNumberToId(bookNum)} by CommitGenerator",
        dblRevisionNumber: null,
        forceCommit: false
    );
}
