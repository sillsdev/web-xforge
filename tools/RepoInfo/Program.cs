/*
 * Paratext Repository Information Tool
 *
 * Usage: dotnet run [CSV] project_path
 *
 * Examples:
 *  - Display the repository information in the console:
 *      dotnet run /var/lib/scriptureforge/sync/59e59e2dce4bb5c863c683c0c4647008dd9767d4/target
 *
 *  - Output the repository information as a CSV file:
 *      dotnet run CSV "C:\My Paratext 9 Projects\ABC" > output.csv
 *
 * Notes:
 *  - The Class column corresponds to how the commit should affect Scripture Forge
 *  - The Classifications are:
 *    BK: Book of the Bible (will affect just that book)
 *    BT: Biblical Terms
 *    NA: Does not affect Scripture Forge
 *    NT: Notes
 *    PE: Permissions
 *    PR: Project level (may affect all SF Books, Notes, Biblical Terms, etc.)
 */

using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using NetLoc;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Repository;
using SIL.Scripture;
using SIL.XForge.Scripture.Services;

#nullable enable

// Get the project path, and CSV from the command line arguments
// Allow the arguments to be in any order
bool csv = false;
string projectPath = string.Empty;
if (args.Length > 0)
{
    projectPath = args[0];
    csv = string.Equals(args[0], "CSV", StringComparison.OrdinalIgnoreCase);
    if (csv && args.Length > 1)
    {
        projectPath = args[1];
    }
    else
    {
        csv = args.Length > 1 && string.Equals(args[1], "CSV", StringComparison.OrdinalIgnoreCase);
    }
}

// Ensure that a path to the project is specified
if (string.IsNullOrWhiteSpace(projectPath))
{
    Console.WriteLine("You must specify the path to the project.");
    return;
}

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

var hgMerge = Path.Join(assemblyDirectory, "ParatextMerge.py");
Hg.Default = new Hg(customHgPath, hgMerge, assemblyDirectory);

// Files which we do not calculate the information for
var ignoredFiles = new[] { "checkingstatus.xml", "projectprogress.tsv", "unique.id" };

// Initialize so that Paratext.Data can find settings files
ScrTextCollection.Implementation = new SFScrTextCollection();
ScrTextCollection.Initialize(projectPath);

// Get the path to the project settings
string? settingsPath = Path.Join(projectPath, "Settings.xml");
if (!File.Exists(settingsPath))
{
    settingsPath = Directory.EnumerateFiles(projectPath, "*.ssf").FirstOrDefault();
    if (settingsPath is null)
    {
        Console.WriteLine("The settings for the project could not be found");
        return;
    }
}

// Get the project settings
using TextReader reader = File.OpenText(settingsPath);
ProjectSettings settings = new ProjectSettings(reader);

// Initialize the localizer, and hide its output
var oldOut = Console.Out;
Console.SetOut(StreamWriter.Null);
Localizer.Str(string.Empty, string.Empty);
Console.SetOut(oldOut);

// Get the revisions
var revisions = Hg.Default.GetLog(projectPath, null, null);
if (revisions is null)
{
    Console.WriteLine("No revisions were found.");
    return;
}

// Order revisions from oldest to newest
revisions.Reverse();

// Set up the columns to display in the table
//
// Explanation of pad right values for each column:
// 1. The highest revision I have seen is < 99999
// 2. A short commit hash is 12 characters
// 3. Classification is a 2-letter code (see comments at top of the file)
// 4. "Properties and Settings" is the longest file type at 23 characters long
const int col1 = 5;
const int col2 = 12;
const int col3 = 2;
const int col4 = 23;
int[] cols = [col1, col2, col3, col4];
int lastCol = Console.WindowWidth - cols.Sum() - cols.Length;
bool canDrawDivider = !csv && lastCol > 0;
if (lastCol < 0)
{
    lastCol = int.MaxValue;
}
if (csv)
{
    Console.WriteLine("Revision,Commit,Type,Class,Filename");
}

// Display the details of each file of each revision
foreach (var revision in revisions)
{
    bool drawDivider = false;
    foreach (string affectedFileName in revision.AffectedFileNames)
    {
        if (!ignoredFiles.Contains(affectedFileName.ToLowerInvariant()))
        {
            FileChange fileChange = new FileChange(affectedFileName, settings, false);
            string fileChangeType = fileChange.File.FileType.ToLocalizedString();

            // Show an understandable file change type
            if (string.IsNullOrWhiteSpace(fileChangeType))
            {
                if (fileChange.File.BookNum > 0)
                {
                    if (fileChange.File.FileTitle.Length > col2 && !csv)
                    {
                        fileChangeType = Canon.BookNumberToId(fileChange.File.BookNum);
                    }
                    else
                    {
                        fileChangeType = fileChange.File.FileTitle;
                    }
                }
                else
                {
                    fileChangeType = fileChange.File.FileTitle;
                }
            }

            // Get the classification
            string classification = fileChange.File.FileType switch
            {
                ProjectFileType.Books => "BK",
                ProjectFileType.Terms or ProjectFileType.Renderings => "BT",
                ProjectFileType.Autocorrect
                or ProjectFileType.Denials
                or ProjectFileType.Figures
                or ProjectFileType.Hyphenation
                or ProjectFileType.Interlinear
                or ProjectFileType.Lexicon
                or ProjectFileType.ModuleSpecifications
                or ProjectFileType.NotAProjectFile
                or ProjectFileType.Passages
                or ProjectFileType.PluginData
                or ProjectFileType.Progress
                or ProjectFileType.RubyGlosses
                or ProjectFileType.SavedFilters
                or ProjectFileType.SharedFiles
                or ProjectFileType.Spelling
                or ProjectFileType.StatusCheckBoxes
                or ProjectFileType.StudyBibleAdditions
                or ProjectFileType.StudyBibleAdditionBooks
                or ProjectFileType.Unspecified => "NA",
                ProjectFileType.RolesPermissions => "PE",
                ProjectFileType.Notes or ProjectFileType.NoteLanguages or ProjectFileType.NoteTags => "NT",
                ProjectFileType.BookNames
                or ProjectFileType.Canons
                or ProjectFileType.LanguageSettings
                or ProjectFileType.PropertiesAndSettings
                or ProjectFileType.ProjectUpdate
                or ProjectFileType.Stylesheet
                or ProjectFileType.Versification
                or ProjectFileType.XmlResourceProject => "PR",
                _ => string.Empty,
            };

            WriteLine(revision, affectedFileName, classification, fileChangeType, ref drawDivider);
        }
    }

    // Show the details of the merge commit
    if (revision.AffectedFileNames.Length == 0)
    {
        WriteLine(revision, string.Join(',', revision.ParentRevNumbers), "NA", "Merge Commit", ref drawDivider);
    }

    if (drawDivider)
    {
        for (int i = 0; i < cols.Length; i++)
        {
            Console.Write(new string('-', cols[i]));
            Console.Write('+');
            if (i == cols.Length - 1)
            {
                // Draw a line to the edge of the console
                Console.WriteLine(new string('-', lastCol));
            }
        }
    }
}

return;

void WriteLine(HgRevision revision, string fileName, string classification, string fileChangeType, ref bool drawDivider)
{
    if (csv)
    {
        // Do not let commas in the file name break the CSV file
        if (fileName.Contains(',', StringComparison.OrdinalIgnoreCase))
        {
            fileName = $"\"{fileName}\"";
        }
        Console.WriteLine(
            $"{revision.LocalRevisionNumber},{revision.Id[..12]},{classification},{fileChangeType},{fileName}"
        );
    }
    else
    {
        // Make sure the filename does not wrap to the next line
        if (fileName.Length > lastCol)
        {
            fileName = $"...{fileName[(fileName.Length - lastCol + 3)..]}";
        }
        Console.WriteLine(
            $"{revision.LocalRevisionNumber, -col1}|{revision.Id[..col2]}|{classification, -col3}|{fileChangeType, -col4}|{fileName}"
        );

        // Draw a divider at the end of this revision
        drawDivider = canDrawDivider;
    }
}
