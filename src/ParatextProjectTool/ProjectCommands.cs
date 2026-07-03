using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Users;
using PtxUtils;
using SIL.Scripture;

namespace ParatextProjectTool;

/// <summary> A project member as passed on the command line and reported by project-info. </summary>
public record ProjectUserSpec(string Name, UserRoles Role);

/// <summary> A book write as passed on the command line: which book, and the USFM file to read. </summary>
public record BookSpec(string BookCode, string UsfmFile);

/// <summary>
/// The operations this tool exposes: creating a Paratext project directory, writing book USFM,
/// replacing the user list, and reporting project metadata. All of them go through ParatextData
/// (ScrText/ProjectSettings/PermissionManager) so the files on disk are produced by the same
/// library, in the same version, that both Paratext and Scripture Forge use to read them.
/// </summary>
public static class ProjectCommands
{
    /// <summary>
    /// Creates a new project directory named <paramref name="id"/> under the projects directory,
    /// with real Settings.xml, ProjectUserAccess.xml and book files. The first Administrator in
    /// <paramref name="users"/> is the acting user (every ParatextData write happens as a user).
    /// </summary>
    public static object CreateProject(
        string projectsDir,
        string id,
        string shortName,
        string fullName,
        string languageTag,
        string languageName,
        List<ProjectUserSpec> users,
        List<BookSpec> books
    )
    {
        HexId guid = HexId.FromStr(id) ?? throw new ArgumentException($"id must be a 40-char hex string, got '{id}'");
        string projectDir = Path.Join(projectsDir, id);
        if (File.Exists(Path.Join(projectDir, ProjectSettings.fileName)))
            throw new InvalidOperationException($"project already exists at {projectDir}");
        ProjectUserSpec actingUser =
            users.FirstOrDefault(user => user.Role == UserRoles.Administrator)
            ?? throw new ArgumentException("at least one user with role Administrator is required");

        Directory.CreateDirectory(projectDir);
        var projectName = new ProjectName { ProjectPath = projectDir, ShortName = shortName };
        using var scrText = new ScrText(projectName, new ToolParatextUser(actingUser.Name), initialize: false);
        ProjectSettings settings = scrText.Settings;
        settings.Guid = guid;
        settings.FullName = fullName;
        // LanguageId's string constructor expects the LanguageIsoCode format "code:script:region:variant".
        settings.LanguageID = new LanguageId(languageTag.Contains(':') ? languageTag : languageTag + ":::");
        settings.SetSetting(Setting.Language, languageName);
        settings.Versification = ScrVers.English;
        settings.Editable = true;
        // Settings.Editable reads as false (and every write is rejected) unless the project meets
        // the minimum supported ParatextData version.
        settings.MinParatextDataVersion = ParatextInfo.MinSupportedParatextDataVersion;
        settings.UsfmVersion = UsfmVersionOption.Version3;
        settings.TranslationInfo = new TranslationInformation(ProjectType.Standard);
        // Match the file naming convention of typical Paratext projects (e.g. 08RUT<ShortName>.SFM).
        settings.FileNamePrePart = "";
        settings.FileNamePostPart = shortName + ".SFM";
        settings.FileNameForm = "41MAT";
        scrText.Save();

        ReplaceUsers(scrText, users);
        foreach (BookSpec book in books)
            WriteBookText(scrText, book.BookCode, File.ReadAllText(book.UsfmFile));
        scrText.Save();
        return ProjectInfo(projectsDir, id);
    }

    /// <summary> Writes a whole book's USFM into an existing project via ScrText.PutText. </summary>
    public static object WriteBook(string projectsDir, string id, string bookCode, string usfmFile)
    {
        using ScrText scrText = OpenProject(projectsDir, id);
        WriteBookText(scrText, bookCode, File.ReadAllText(usfmFile));
        scrText.Save();
        return ProjectInfo(projectsDir, id);
    }

    /// <summary> Replaces the project's user list (ProjectUserAccess.xml) with the given users. </summary>
    public static object SetUsers(string projectsDir, string id, List<ProjectUserSpec> users)
    {
        if (users.All(user => user.Role != UserRoles.Administrator))
            throw new ArgumentException("at least one user with role Administrator is required");
        using ScrText scrText = OpenProject(projectsDir, id);
        ReplaceUsers(scrText, users);
        return ProjectInfo(projectsDir, id);
    }

    /// <summary> Reports project metadata (settings, books present, users) as a JSON-friendly object. </summary>
    public static object ProjectInfo(string projectsDir, string id)
    {
        using ScrText scrText = OpenProject(projectsDir, id);
        List<string> bookCodes = [.. scrText.Settings.BooksPresentSet.SelectedBookNumbers.Select(Canon.BookNumberToId)];
        List<object> users =
        [
            .. scrText.Permissions.Users.Select(user => (object)new { name = user.Name, role = user.Role.ToString() }),
        ];
        return new
        {
            id = scrText.Settings.Guid.ToString(),
            shortName = scrText.Name,
            fullName = scrText.Settings.FullName,
            languageTag = scrText.Settings.LanguageID?.Id,
            languageName = scrText.Settings.GetSetting(Setting.Language),
            books = bookCodes,
            users,
        };
    }

    /// <summary>
    /// Opens an existing project directory as a ScrText. The acting user is an Administrator taken
    /// from the project's own ProjectUserAccess.xml, so writes pass ParatextData's permission
    /// checks the same way they would for a real project administrator.
    /// </summary>
    private static ScrText OpenProject(string projectsDir, string id)
    {
        string projectDir = Path.Join(projectsDir, id);
        string settingsFile = Path.Join(projectDir, ProjectSettings.fileName);
        if (!File.Exists(settingsFile))
            throw new FileNotFoundException($"no project at {projectDir} ({ProjectSettings.fileName} missing)");
        string shortName =
            XElement.Parse(File.ReadAllText(settingsFile)).Element("Name")?.Value
            ?? throw new InvalidDataException($"{settingsFile} has no Name element");
        string actingUserName = FindAdminUserName(projectDir) ?? "Mock Administrator";
        var projectName = new ProjectName { ProjectPath = projectDir, ShortName = shortName };
        return new ScrText(projectName, new ToolParatextUser(actingUserName));
    }

    /// <summary>
    /// Returns the name of an Administrator from ProjectUserAccess.xml, or null when the file does
    /// not exist yet (fresh project) or lists no administrator.
    /// </summary>
    private static string? FindAdminUserName(string projectDir)
    {
        string userAccessFile = Path.Join(projectDir, ProjectPermissionManager.fileName);
        if (!File.Exists(userAccessFile))
            return null;
        return XElement
            .Parse(File.ReadAllText(userAccessFile))
            .Elements("User")
            .FirstOrDefault(user => user.Element("Role")?.Value == UserRoles.Administrator.ToString())
            ?.Attribute("UserName")
            ?.Value;
    }

    private static void WriteBookText(ScrText scrText, string bookCode, string usfm)
    {
        int bookNum = Canon.BookIdToNumber(bookCode);
        if (bookNum <= 0)
            throw new ArgumentException($"unknown book code '{bookCode}'");
        const int wholeBook = 0;
        scrText.PutText(bookNum, wholeBook, false, usfm, null);
    }

    private static void ReplaceUsers(ScrText scrText, List<ProjectUserSpec> users)
    {
        PermissionManager permissions = scrText.Permissions;
        foreach (string existingName in permissions.UserNames.ToList())
        {
            if (users.All(user => user.Name != existingName))
                permissions.RemoveUser(existingName);
        }
        const int allBooks = 0;
        foreach (ProjectUserSpec user in users)
        {
            if (permissions.UserNames.Contains(user.Name))
                permissions.ChangeUserRole(user.Name, user.Role);
            else
                permissions.CreateUser(user.Name, user.Role);
            // Without a book assignment every edit is rejected (SF shows "You don't have
            // permission to edit this chapter"). Editing roles get the "all books" assignment a
            // Paratext administrator would typically give them.
            if (user.Role == UserRoles.Administrator || user.Role == UserRoles.TeamMember)
                permissions.SetPermission(user.Name, allBooks, PermissionSet.Manual, granted: true);
        }
        if (permissions is ProjectPermissionManager projectPermissions)
            projectPermissions.Save();
        else
            throw new InvalidOperationException("expected a ProjectPermissionManager to persist users");
    }
}
