using System.Text;
using System.Diagnostics;
using System.Xml.Serialization;
using Paratext.Data.ProjectComments;

public class Program
{
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
        List<string> projectDirs = new();
        projectDirs.Add("SFP");

        // For each project:
        //   List all commits on notes xml files since 2023-06-21
        //   Ignore commits not made by specific machine name.
        //   For each remaining commit:
        //     For each notes file changed in the commit:
        //       Fetch a copy of the before and after of the notes file (before and after the commit)
        //       Show how did SF meaningfully change the content.

        await ProcessProjectsAsync(projectDirs);
    }

    private static async Task ProcessProjectsAsync(List<string> projectDirs)
    {
        foreach (string projectDir in projectDirs)
            await ProcessProjectAsync(projectDir);
    }

    private static async Task ProcessProjectAsync(string projectDir)
    {
        string commitListBlob = await RunCommand(
            "hg",
            "log --no-merges --date >2023-06-21 --template CommitId:{node}\nDate:{date|date}\nDesc:{desc}\nFiles:{files%'{file}\n'}\n",
            $"/home/vagrant/note-corruption/{projectDir}/target"
        );
        Console.WriteLine(commitListBlob);
        List<CommitData> commitData = CommitParser.Parse(commitListBlob);
        Console.WriteLine(commitData[0]);
    }

    private static async Task<string> RunCommand(string program, string arguments, string workingDirectory)
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
        public string Comment { get; set; }
        public string MachineName { get; set; }
        public string ApplicationVersion { get; set; }
        public List<string> Files { get; set; }
    }

    public class CommitParser
    {
        public static List<CommitData> Parse(string data)
        {
            var commits = new List<CommitData>();
            var lines = data.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            var currentCommit = new CommitData();

            foreach (var line in lines)
            {
                var parts = line.Split(':');
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
                    case "Comment":
                        currentCommit.Comment = value;
                        break;
                    case "MachineName":
                        currentCommit.MachineName = value;
                        break;
                    case "ApplicationVersion":
                        currentCommit.ApplicationVersion = value;
                        break;
                    case "Files":
                        currentCommit.Files = value.Split(',').Select(f => f.Trim()).ToList();
                        break;
                    case "":
                        // Blank line indicates the end of a commit, add it to the list
                        commits.Add(currentCommit);
                        currentCommit = new CommitData();
                        break;
                }
            }

            return commits;
        }
    }
}
