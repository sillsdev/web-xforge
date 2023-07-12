using System.Text;
using System.Diagnostics;
using System.Xml.Serialization;
using Paratext.Data.ProjectComments;
using System.Xml.Linq;
using System.Text.RegularExpressions;

public class Program
{
    string machineName = "";
    string projectDir = "";
    string projectRootDir = "";
    public static void Timing()
    {
        // Warm up on a small file
        Console.WriteLine("Small File (includes warm-up):");
        Stopwatch smallWatch = Stopwatch.StartNew();
        XmlSerializer smallSerializer = new XmlSerializer(typeof(CommentList));
        using StreamReader smallStreamReader = new StreamReader("small_xml.xml");
        CommentList? smallCommentList = smallSerializer.Deserialize(smallStreamReader) as CommentList;
        smallWatch.Stop();
        Console.WriteLine($"Elapsed: {smallWatch.ElapsedMilliseconds} ms");
        Console.WriteLine($"Comments: {smallCommentList?.Count}");

        // Run on the large file after warm up
        Console.WriteLine("Large File:");
        Stopwatch largeWatch = Stopwatch.StartNew();
        XmlSerializer largeSerializer = new XmlSerializer(typeof(CommentList));
        using StreamReader largeStreamReader = new StreamReader("large_xml.xml");
        CommentList? largeCommentList = largeSerializer.Deserialize(largeStreamReader) as CommentList;
        largeWatch.Stop();
        Console.WriteLine($"Elapsed: {largeWatch.ElapsedMilliseconds} ms");
        Console.WriteLine($"Comments: {largeCommentList?.Count}");
    }

    public static async Task Main()
    {
        var program = new Program();
        List<string> projectDirs = new();
        projectDirs.Add(program.projectDir);

        // For each project:
        //   List all commits on notes xml files since 2023-06-21
        //   Ignore commits not made by specific machine name.
        //   For each remaining commit:
        //     For each notes file changed in the commit:
        //       Fetch a copy of the before and after of the notes file (before and after the commit)
        //       Show how did SF meaningfully change the content.

        await program.ProcessProjectsAsync(projectDirs);
    }

    private async Task ProcessProjectsAsync(List<string> projectDirs)
    {
        foreach (string projectDir in projectDirs)
            await ProcessProjectAsync(projectDir);
    }

    private async Task ProcessProjectAsync(string projectDir)
    {
        string repoDir = $"{projectRootDir}/{projectDir}/target";
        string commitListBlob = await RunCommandAsync(
            "hg",
            // "log --no-merges --date >2023-06-21 --template CommitId:{node}\tDate:{date|date}",
            "log --no-merges --date >2023-06-21 --template CommitId:{node}---Date:{date|date}---Desc:{desc}---Files:{files%'{file}\n'}-----",
            repoDir
        );
        Console.WriteLine(commitListBlob);
        List<CommitData> commitData = CommitParser.Parse(commitListBlob);
        foreach (var data in commitData)
        {
            data.RepoDir = repoDir;
        }
        // Console.WriteLine(commitData[0]);
        IEnumerable<CommitData> relevantCommits = commitData.Where(c => c.MachineName == machineName).Where(c => c.Files.Any(f => Regex.Match(f, "notes.*.xml", RegexOptions.IgnoreCase).Length > 0));

        foreach (CommitData commit in relevantCommits)
        {
            foreach (string notesFile in commit.Files.Where(f => Regex.Match(f, "notes.*.xml", RegexOptions.IgnoreCase).Length > 0))
            {
                await ProcessNotesFileAsync(commit, notesFile);
            }
        }
        // For each notes file


        // Get a snapshot of before and after
    }

    private static async Task ProcessNotesFileAsync(CommitData data, string filename)
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
                // Console.WriteLine("*********** problem detected *****************");
                Console.WriteLine($"{data.RepoDir} {data.CommitId} {filename}");
            }
        }
    }

    private static async Task<string> FetchFileAsync(string commitId, string filename, string path)
    {
        return await RunCommandAsync("hg", $"cat -r {commitId} \"{filename}\"", path);
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
            RedirectStandardError = true
        };
        process.Start();
        while (!process.HasExited)
        {
            output.Append(await process.StandardOutput.ReadToEndAsync());
            error.Append(await process.StandardError.ReadToEndAsync());
        }
        if (error.Length > 0)
            Console.WriteLine($"Warning: Command gave error output: {error}");
        return output.ToString();
    }

    public class CommitData
    {
        public string CommitId { get; set; }
        public DateTime Date { get; set; }
        public string MachineName { get; set; }
        public List<string> Files { get; set; }
        public string RepoDir { get; set; }
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
                            XDocument doc = XDocument.Parse(value);
                            var machineName = doc.Descendants("MachineName").SingleOrDefault();
                            currentCommit.MachineName = machineName.Value;
                            break;
                        case "Files":
                            currentCommit.Files = value.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries).Select(f => f.Trim()).ToList();
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
