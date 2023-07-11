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
}
