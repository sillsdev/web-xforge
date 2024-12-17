using System;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using System.Xml.Serialization;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace BackoutCommits;

public class Program
{
    string machineName = "";
    string projectRootDir = "";
    public ISFProjectTool projectTool;
    public ISyncAllService syncAllService;
    public static IProgramLogger Logger;

    class ProblemCommit
    {
        public string projectRepo = string.Empty;
        public string commitId = string.Empty;
    }

    public static async Task Main(string[] args)
    {
        string sfAppDir = args.Length >= 1 ? args[0] : string.Empty;
        if (string.IsNullOrWhiteSpace(sfAppDir))
        {
            // This calculated from "web-xforge\src\Migrations\BackoutCommits"
            sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../SIL.XForge.Scripture";
        }

        Directory.SetCurrentDirectory(sfAppDir);
        IWebHostBuilder builder = CreateWebHostBuilder(args);
        IWebHost webHost = builder.Build();
        Logger = webHost.Services.GetService<IProgramLogger>();

        try
        {
            await webHost.StartAsync();
        }
        catch (HttpRequestException)
        {
            Logger.Log(
                "There was an error starting the program before getting to the inspection or migration. "
                    + "Maybe the SF server is running on this machine and needs shut down? Rethrowing."
            );
            throw;
        }

        var program = new Program();
        program.projectTool = webHost.Services.GetService<ISFProjectTool>();
        program.syncAllService = webHost.Services.GetService<ISyncAllService>();

        program.machineName = Environment.GetEnvironmentVariable("MACHINE_NAME");
        string projectIdsString = Environment.GetEnvironmentVariable("PROJECT_IDS");
        Logger.Log($"Project IDs: {projectIdsString}");
        bool runMode = Environment.GetEnvironmentVariable("RUN_MODE") == "true";
        Logger.Log($"Running in {(runMode ? "run" : "dry run")} mode.");
        program.projectRootDir = Environment.GetEnvironmentVariable("PROJECT_ROOT_DIR");
        Logger.Log($"Project root dir: {program.projectRootDir}");
        if (
            string.IsNullOrWhiteSpace(program.machineName)
            || string.IsNullOrWhiteSpace(projectIdsString)
            || string.IsNullOrWhiteSpace(program.projectRootDir)
        )
            throw new Exception("Please set the MACHINE_NAME, PROJECT_IDS and PROJECT_ROOT_DIR variables.");
        bool backoutOnly = Environment.GetEnvironmentVariable("BACKOUT_ONLY") == "true";
        bool syncOnly = Environment.GetEnvironmentVariable("SYNC_ONLY") == "true";
        IEnumerable<string> projectIds = projectIdsString.Split(' ');

        // Find all of the revisions that introduce changes to notes files
        await program.projectTool.ConnectToRealtimeServiceAsync();
        await program.ProcessProjectsAsync(projectIds, runMode && !syncOnly);
        await program.SyncProjectsAsync(projectIds, runMode && !backoutOnly);
        program.projectTool.Dispose();
        await webHost.StopAsync();
    }

    private async Task ProcessProjectsAsync(IEnumerable<string> projectIds, bool runMode)
    {
        foreach (string projectId in projectIds)
        {
            IDocument<SFProject> projectDoc = await projectTool.GetProjectDocAsync(projectId);
            List<ProblemCommit> problemCommits = await ProcessProjectAsync(projectDoc.Data.ParatextId);
            await BackoutProblemCommitsAsync(problemCommits, projectDoc, runMode);
        }
    }

    private async Task<List<ProblemCommit>> ProcessProjectAsync(string projectDir)
    {
        string repoDir = $"{projectRootDir}/{projectDir}/target";
        Logger.Log($"Processing project at {repoDir}");
        string commitListBlob = await RunCommandAsync(
            "hg",
            "log --no-merges --date \"jun 21 2023 to jul 5 2023\" --template CommitId:{node}---Date:{date|date}---Desc:{desc}---Files:{files%'{file}\n'}-----",
            repoDir
        );
        List<CommitData> commitData = CommitParser.Parse(commitListBlob);
        foreach (var data in commitData)
        {
            data.RepoDir = repoDir;
        }
        IEnumerable<CommitData> relevantCommits = commitData
            .Where(c => c.MachineName == machineName)
            .Where(c => c.Files.Any(f => Regex.Match(f, "notes.*.xml", RegexOptions.IgnoreCase).Length > 0));
        Logger.Log($">  Found {relevantCommits.Count()} commits made after 2023-06-21 that modify notes files.");
        List<ProblemCommit> problemCommits = new();
        foreach (CommitData commit in relevantCommits)
        {
            foreach (
                string notesFile in commit.Files.Where(f =>
                    Regex.Match(f, "notes.*.xml", RegexOptions.IgnoreCase).Length > 0
                )
            )
            {
                ProblemCommit problemCommit = await ProcessNotesFileAsync(commit, notesFile);
                if (problemCommit != null)
                {
                    problemCommits.Add(problemCommit);
                    break;
                }
            }
        }
        Logger.Log($">  Found {problemCommits.Count} commits where SF writes notes data.");
        return problemCommits;
    }

    private static async Task<ProblemCommit> ProcessNotesFileAsync(CommitData data, string filename)
    {
        string fileBefore = await FetchFileAsync(data.CommitId + '^', filename, data.RepoDir);
        string fileAfter = await FetchFileAsync(data.CommitId, filename, data.RepoDir);

        if (!string.IsNullOrEmpty(fileBefore) && !string.IsNullOrEmpty(fileAfter))
        {
            XDocument beforeDoc = XDocument.Parse(fileBefore);
            XDocument afterDoc = XDocument.Parse(fileAfter);
            string beforeDocStr = beforeDoc.ToString();
            string afterDocStr = afterDoc.ToString();

            bool isEqual = beforeDocStr.Equals(afterDocStr);
            if (!isEqual)
            {
                return new ProblemCommit() { projectRepo = data.RepoDir, commitId = data.CommitId };
            }
        }
        return null;
    }

    private static async Task<string> FetchFileAsync(string commitId, string filename, string path)
    {
        return await RunCommandAsync("hg", $"cat -r {commitId} \"{filename}\"", path);
    }

    private async Task BackoutProblemCommitsAsync(
        List<ProblemCommit> problemCommits,
        IDocument<SFProject> projectDoc,
        bool runMode
    )
    {
        if (problemCommits.Count == 0)
        {
            Logger.Log(">  No problem commits found, nothing to do.");
            return;
        }

        string adminUser = projectDoc
            .Data.UserRoles.Where(ur => ur.Value == SFProjectRole.Administrator)
            .Select(ur => projectDoc.Data.ParatextUsers.SingleOrDefault(pu => pu.SFUserId == ur.Key)?.Username)
            .FirstOrDefault(user => !string.IsNullOrEmpty(user));
        if (string.IsNullOrEmpty(adminUser))
            throw new InvalidOperationException("No admin user found for project " + projectDoc.Id);

        Logger.Log("  > Backing out as user: " + adminUser);
        // Testing shows that if we remove community checking answer notes, they will come back when SF syncs.
        string projectDir = problemCommits[0].projectRepo;
        if (!runMode)
            Logger.Log("  >  Dry run, no files will be changed.");

        foreach (ProblemCommit commit in problemCommits)
        {
            Logger.Log($"  >  Backing out commit {commit.commitId}");

            // Backout of the commit but only the notes files. Use the internal:merge-local tool which will
            // use the revision at the tip as the authoritative version in the event there are conflicts.
            // This works because conflicts occurs on xml format changes, and the tip revision is from
            // Paratext which has the formatting we want to conform to.
            string hgCommand =
                $"backout --rev {commit.commitId} --user \"{adminUser}\" --include Notes_*.xml --message \"Backing out {commit.commitId}\" --encoding utf-8   --tool internal:merge-local";
            if (!runMode)
            {
                Logger.Log($"  >  Dry run: {hgCommand}");
                continue;
            }
            await RunCommandAsync("hg", hgCommand, commit.projectRepo);
            // After backing out notes xml files, some other files may be left as modified in the working directory, such as .SFM files. We revert these before proceeding.
            await RunCommandAsync("hg", $"revert --all", commit.projectRepo);
        }
        Logger.Log(">  Successfully backed out problem commits.");
        string currentId = (await RunCommandAsync("hg", $"id --debug -i", projectDir)).Trim();
        Logger.Log($">  Current commit id: {currentId}");
        if (runMode)
            await projectTool.UpdateProjectRepositoryVersionAsync(projectDoc, currentId);
    }

    private async Task SyncProjectsAsync(IEnumerable<string> projectId, bool runMode)
    {
        Logger.Log("> Syncing projects");
        await syncAllService.SynchronizeAllProjectsAsync(runMode, projectId.ToHashSet(), projectRootDir);
    }

    private static async Task<string> RunCommandAsync(string program, string arguments, string workingDirectory)
    {
        StringBuilder output = new();
        StringBuilder error = new();
        System.Diagnostics.Process process = new();
        process.StartInfo = new()
        {
            WorkingDirectory = workingDirectory,
            FileName = program,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        process.Start();
        while (!process.HasExited)
        {
            output.Append(await process.StandardOutput.ReadToEndAsync());
            error.Append(await process.StandardError.ReadToEndAsync());
        }
        if (error.Length > 0)
            Logger.Log($"Warning: Command gave error output: {error}");
        return output.ToString();
    }

    /// <summary>
    /// This was copied and modified from `SIL.XForge.Scripture/Program.cs`.
    /// </summary>
    private static IWebHostBuilder CreateWebHostBuilder(string[] args)
    {
        IWebHostBuilder builder = WebHost.CreateDefaultBuilder(args);

        // Secrets to connect to PT web API are associated with the SIL.XForge.Scripture assembly.
        Assembly sfAssembly = Assembly.GetAssembly(typeof(ParatextService));

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .AddUserSecrets(sfAssembly)
            .SetBasePath(Directory.GetCurrentDirectory())
            .Build();

        return builder
            .ConfigureAppConfiguration(
                (context, config) =>
                {
                    IWebHostEnvironment env = context.HostingEnvironment;
                    if (env.IsDevelopment() || env.IsEnvironment("Testing"))
                        config.AddJsonFile("appsettings.user.json", true);
                    else
                        config.AddJsonFile("secrets.json", true, true);
                    if (env.IsEnvironment("Testing"))
                    {
                        var appAssembly = Assembly.Load(new AssemblyName(env.ApplicationName));
                        if (appAssembly != null)
                            config.AddUserSecrets(appAssembly, true);
                    }
                    config.AddEnvironmentVariables();
                }
            )
            .UseConfiguration(configuration)
            .UseStartup<Startup>();
    }

    public class CommitData
    {
        public string CommitId { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string MachineName { get; set; } = string.Empty;
        public List<string> Files { get; set; } = new();
        public string RepoDir { get; set; } = string.Empty;
    }

    public class CommitParser
    {
        public static List<CommitData> Parse(string data)
        {
            var commits = new List<CommitData>();
            var setOfCommits = data.Split(new[] { "-----" }, StringSplitOptions.RemoveEmptyEntries);
            var currentCommit = new CommitData();

            foreach (var commitChunk in setOfCommits)
            {
                var commitChunkPart = commitChunk.Split(new[] { "---" }, System.StringSplitOptions.RemoveEmptyEntries);
                foreach (var part in commitChunkPart)
                {
                    var parts = part.Split(':');
                    if (parts.Length != 2)
                        continue;

                    var key = parts[0].Trim();
                    var value = parts[1].Trim();

                    switch (key)
                    {
                        case "CommitId":
                            currentCommit.CommitId = value;
                            break;
                        case "Date":
                            currentCommit.Date = DateTime.Parse(value);
                            break;
                        case "Desc":
                            try
                            {
                                XDocument doc = XDocument.Parse(value);
                                XElement machineName = doc.Descendants("MachineName").SingleOrDefault();
                                currentCommit.MachineName = machineName?.Value ?? string.Empty;
                            }
                            catch
                            {
                                currentCommit.MachineName = "unknown";
                            }
                            break;
                        case "Files":
                            currentCommit.Files = value
                                .Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries)
                                .Select(f => f.Trim())
                                .ToList();
                            break;
                        case "":
                            // Blank line indicates the end of a commit, add it to the list
                            // commits.Add(currentCommit);
                            // currentCommit = new CommitData();
                            break;
                    }
                }
                commits.Add(currentCommit);
                currentCommit = new CommitData();
            }

            return commits;
        }
    }
}
