using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace SIL.XForge.Scripture;

public static class Migrator
{
    public static void RunMigrations(string environment)
    {
        // In a container, the migration process will be run by start.sh
        if (Product.RunningInContainer)
            return;
        string version = Product.Version;
        string projectPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        string migratorPath = Path.Combine(
            projectPath,
            "RealtimeServer",
            "lib",
            "cjs",
            "scriptureforge",
            "migrator.js"
        );

        var startInfo = new ProcessStartInfo
        {
            FileName = "node",
            RedirectStandardOutput = true,
            ArgumentList = { migratorPath, environment, version },
        };

        var startTime = DateTime.Now;
        Console.WriteLine($"[{startTime:o}] Starting migrator");

        using var process = Process.Start(startInfo);
        while (!process.StandardOutput.EndOfStream)
        {
            Console.WriteLine(process.StandardOutput.ReadLine());
        }
        process.WaitForExit();

        var exitCode = process.ExitCode;
        Console.WriteLine($"[{process.ExitTime:o}] Migrator exited with code {exitCode}");
        Console.WriteLine($"Total time running migrator was {process.ExitTime - startTime}");
        if (exitCode != 0)
        {
            throw new Exception($"Migrator exited with code {exitCode}");
        }
    }
}
