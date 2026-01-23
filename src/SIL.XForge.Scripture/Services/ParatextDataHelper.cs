using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectFileUpdates;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Repository;
using SIL.Scripture;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides methods calls to Paratext Data. Can be mocked in tests.
/// </summary>
/// <param name="fileSystemService">The file system service.</param>
public class ParatextDataHelper(IFileSystemService fileSystemService) : IParatextDataHelper
{
    public void CommitVersionedText(ScrText scrText, string comment)
    {
        // Commit() will fail silently if the user is an Observer,
        // so throw an error if the user is an Observer.
        if (!scrText.Permissions.HaveRoleNotObserver)
        {
            throw new InvalidOperationException("User does not have permission to commit.");
        }

        // Write the commit to the repository
        VersionedText vText = VersioningManager.Get(scrText);
        vText.Commit(comment, null, false);
    }

    /// <summary>
    /// Migrates a Paratext Resource, if required.
    /// </summary>
    /// <param name="scrText">The Paratext Scripture Text.</param>
    /// <param name="overrideLanguage">The language to override, if the project's language is incorrect.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>An asynchronous task.</returns>
    /// <remarks>
    /// This only performs basic migrations required for Serval. Full migration can only be performed by Paratext.
    ///
    /// Migrations included:
    ///  - MigrateLanguage
    ///  - MigrateStyleSheet
    ///  - MigrateVersification
    /// </remarks>
    public async Task MigrateResourceIfRequiredAsync(
        ScrText scrText,
        LanguageId? overrideLanguage,
        CancellationToken token
    )
    {
        // Migrate the language id if it is missing. It will be missing as the project has changed from a resource (p8z)
        // to a project (directory based), and we did not write to the p8z file as Paratext does in its migrators.
        // The ScrText created above will not have the values defined in DetermineBestLanguageForResource() above, so
        // we will need to override them again before migrating the LDML (an action which requires the LanguageID).
        if (overrideLanguage is not null)
        {
            scrText.Settings.LanguageID = overrideLanguage;

            // This will create Settings.xml with the correct LanguageIsoCode value
            scrText.Settings.Save();
        }

        // Perform a simple migration of the Paratext 7 LDML file to the new Paratext 8+ location.
        // Paratext performs a much more complex migration, but we do not need that level of detail.
        // If the publisher updates this resource, this file will be overwritten with the fully migrated language file,
        // stopping this migration from running in the future and negating its need.
        string oldLdmlFile = Path.Join(scrText.FullPath, "ldml.xml");
        string newLdmlFile = Path.Join(scrText.FullPath, scrText.Settings.LdmlFileName);
        if (fileSystemService.FileExists(oldLdmlFile) && !fileSystemService.FileExists(newLdmlFile))
        {
            fileSystemService.MoveFile(oldLdmlFile, newLdmlFile);
        }

        // Migrate the USFM stylesheet
        if (
            scrText.Settings.DefaultStylesheetFileName != "usfm.sty"
            && scrText.Settings.DefaultStylesheetFileName != "usfm_sb.sty"
        )
        {
            UpdateStyleSheetToUsfm.ConvertToStandardStyleSheet(scrText);
        }

        // Migrate the versification if it is a non-standard versification (1-6 are supported by PT9)
        if (
            int.TryParse(scrText.Settings.GetSetting(Setting.Versification), out int versificationCode)
            && versificationCode > 7
        )
        {
            // Get first *.vrs file that is not custom.vrs
            string verseFilePath = fileSystemService
                .EnumerateFiles(scrText.FullPath, "*.vrs")
                .FirstOrDefault(fileName =>
                    !Path.GetFileName(fileName)
                        .Equals(ParatextVersificationTable.customVersFilename, StringComparison.OrdinalIgnoreCase)
                );
            if (!string.IsNullOrEmpty(verseFilePath))
            {
                // Create the custom verse file
                await CreateCustomVersificationFileAsync(verseFilePath, scrText.FullPath, token);

                // Change the project to original versification
                scrText.Settings.Versification = ScrVers.Original;
                scrText.Settings.Save();
            }
        }
    }

    /// <summary>
    /// Creates a custom versification file based on the provided verse file.
    /// </summary>
    /// <param name="verseFilePath">The full path to the versification file.</param>
    /// <param name="projectPath">The full path to the Paratext project.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>An asynchronous task.</returns>
    /// <remarks>
    /// This is not as comprehensive as the migrator in Paratext, but will convert the versification
    /// to a format that ParatextData and Serval can understand.
    /// </remarks>
    private async Task CreateCustomVersificationFileAsync(
        string verseFilePath,
        string projectPath,
        CancellationToken token
    )
    {
        // Load the existing custom versification file, if it exists, and record its contents
        string customVrsFilePath = Path.Join(projectPath, ParatextVersificationTable.customVersFilename);
        string customVrsFileContents = string.Empty;
        if (fileSystemService.FileExists(customVrsFilePath))
        {
            customVrsFileContents = fileSystemService.FileReadText(customVrsFilePath);
        }

        // Open the custom versification file for writing
        await using Stream customVrsStream = fileSystemService.OpenFile(
            customVrsFilePath,
            FileMode.OpenOrCreate,
            FileAccess.Write,
            FileShare.None
        );
        await using StreamWriter writer = new StreamWriter(customVrsStream);

        // Open the project versification file for reading
        await using Stream projectVrsStream = fileSystemService.OpenFile(
            verseFilePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read
        );
        using StreamReader reader = new StreamReader(projectVrsStream);

        // Convert every line of the project versification file to the new format
        while (await reader.ReadLineAsync(token) is { } line)
        {
            ParsedVersificationLine parsedLine = Versification.Table.ParseLine(line);
            await writer.WriteAsync(parsedLine.ToString());
            if (parsedLine.LineType == LineType.chapterVerse)
            {
                await writer.WriteAsync(" END");
            }

            // Ensure that the versification file is in Windows format
            await writer.WriteAsync("\r\n");
        }

        // Append the old customer versification file contents to the new file
        if (!string.IsNullOrWhiteSpace(customVrsFileContents))
        {
            await writer.WriteAsync(customVrsFileContents);
        }
    }
}
