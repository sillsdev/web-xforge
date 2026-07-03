using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Paratext.Data.Users;

namespace ParatextProjectTool;

/// <summary>
/// Command-line entry point. This tool creates and modifies Paratext project directories using
/// ParatextData itself (the same library and version the SF backend uses), so the resulting files
/// are faithful to what Paratext produces. It is consumed by src/MockServices to back its
/// project-creation and Paratext-side-edit control operations.
///
/// Commands (all print a JSON result on stdout; errors go to stderr with exit code 1):
///   create-project --projects-dir D --id HEX40 --short-name NAME [--full-name F]
///                  [--language en] [--language-name English]
///                  --user "Name=Administrator" [--user "Name=TeamMember" ...]
///                  [--book RUT=/path/to.usfm ...]
///   write-book     --projects-dir D --id HEX40 --book RUT=/path/to.usfm
///   set-users      --projects-dir D --id HEX40 --user "Name=Role" [...]
///   project-info   --projects-dir D --id HEX40
///
/// Roles are ParatextData UserRoles names: Administrator, TeamMember, Consultant, Observer, None.
/// </summary>
public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
                throw new ArgumentException(
                    "no command given; expected create-project|write-book|set-users|project-info"
                );
            string command = args[0];
            Dictionary<string, List<string>> options = ParseOptions(args.Skip(1));
            string projectsDir = RequireOption(options, "projects-dir");
            string id = RequireOption(options, "id");
            ToolEnvironment.Initialize(projectsDir);

            object result = command switch
            {
                "create-project" => ProjectCommands.CreateProject(
                    projectsDir,
                    id,
                    RequireOption(options, "short-name"),
                    SingleOption(options, "full-name") ?? RequireOption(options, "short-name"),
                    SingleOption(options, "language") ?? "en",
                    SingleOption(options, "language-name") ?? "English",
                    ParseUsers(options),
                    ParseBooks(options)
                ),
                "write-book" => WriteBooks(options, projectsDir, id),
                "set-users" => ProjectCommands.SetUsers(projectsDir, id, ParseUsers(options)),
                "project-info" => ProjectCommands.ProjectInfo(projectsDir, id),
                _ => throw new ArgumentException($"unknown command '{command}'"),
            };
            Console.WriteLine(JsonSerializer.Serialize(result));
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"Error: {e.Message}");
            return 1;
        }
    }

    private static object WriteBooks(Dictionary<string, List<string>> options, string projectsDir, string id)
    {
        List<BookSpec> books = ParseBooks(options);
        if (books.Count == 0)
            throw new ArgumentException("write-book requires at least one --book CODE=usfm-file");
        object result = new { };
        foreach (BookSpec book in books)
            result = ProjectCommands.WriteBook(projectsDir, id, book.BookCode, book.UsfmFile);
        return result;
    }

    /// <summary> Parses "--key value" pairs; repeated keys accumulate (used by --user and --book). </summary>
    private static Dictionary<string, List<string>> ParseOptions(IEnumerable<string> args)
    {
        var options = new Dictionary<string, List<string>>();
        string? currentKey = null;
        foreach (string arg in args)
        {
            if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                currentKey = arg[2..];
                if (!options.ContainsKey(currentKey))
                    options[currentKey] = [];
            }
            else if (currentKey != null)
            {
                options[currentKey].Add(arg);
                currentKey = null;
            }
            else
            {
                throw new ArgumentException($"unexpected argument '{arg}'");
            }
        }
        return options;
    }

    private static string RequireOption(Dictionary<string, List<string>> options, string key) =>
        SingleOption(options, key) ?? throw new ArgumentException($"missing required option --{key}");

    private static string? SingleOption(Dictionary<string, List<string>> options, string key) =>
        options.TryGetValue(key, out List<string>? values) ? values.FirstOrDefault() : null;

    private static List<ProjectUserSpec> ParseUsers(Dictionary<string, List<string>> options)
    {
        List<string> values = options.TryGetValue("user", out List<string>? userValues) ? userValues : [];
        return
        [
            .. values.Select(value =>
            {
                int separator = value.LastIndexOf('=');
                if (separator <= 0)
                    throw new ArgumentException($"--user must be \"Name=Role\", got '{value}'");
                string roleName = value[(separator + 1)..];
                if (!Enum.TryParse(roleName, out UserRoles role))
                    throw new ArgumentException($"unknown role '{roleName}' in --user '{value}'");
                return new ProjectUserSpec(value[..separator], role);
            }),
        ];
    }

    private static List<BookSpec> ParseBooks(Dictionary<string, List<string>> options)
    {
        List<string> values = options.TryGetValue("book", out List<string>? bookValues) ? bookValues : [];
        return
        [
            .. values.Select(value =>
            {
                int separator = value.IndexOf('=');
                if (separator <= 0)
                    throw new ArgumentException($"--book must be \"CODE=usfm-file\", got '{value}'");
                return new BookSpec(value[..separator], value[(separator + 1)..]);
            }),
        ];
    }
}
