using System;
using System.Diagnostics;
using System.IO;

namespace SIL.XForge.Scripture;

public static class Migrator
{
    public static void RunMigrations(string environment)
    {
        using var process = new Process();
        process.StartInfo.FileName = "node";
        string srcDir = Directory.GetParent(Directory.GetCurrentDirectory()).ToString();
        string migratorPath = Path.Combine(srcDir, "RealtimeServer", "lib", "cjs", "scriptureforge", "migrator.js");
        process.StartInfo.ArgumentList.Add(migratorPath);
        process.StartInfo.ArgumentList.Add(environment);
        string location = System.Reflection.Assembly.GetEntryAssembly().Location;
        process.StartInfo.ArgumentList.Add(FileVersionInfo.GetVersionInfo(location).ProductVersion);
        process.StartInfo.RedirectStandardOutput = true;

        var startTime = DateTime.Now;
        Console.WriteLine($"[{startTime:o}] Starting migrator");

        process.Start();
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
            Environment.Exit(exitCode);
        }
    }
}
