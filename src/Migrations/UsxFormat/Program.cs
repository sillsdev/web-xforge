using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace Migrations
{
    class Program
    {
        static async Task Main(string[] args)
        {
            const string siteDir = "/var/lib/scriptureforge";
            string syncDir = Path.Combine(siteDir, "sync");
            bool doWrite = ((args.Length >= 1 ? args[0] : "") == "run");

            Console.WriteLine("Migrate USX XML sync files.\n");
            if (!Directory.Exists(siteDir))
            {
                Console.WriteLine($"Site folder doesn't exist: {siteDir}");
                Environment.Exit(1);
            }
            if (!Directory.Exists(syncDir))
            {
                Console.WriteLine($"Sync folder doesn't exist: {syncDir}");
                Environment.Exit(1);
            }
            if (!doWrite)
            {
                ConsoleColor savedForegroundColor = Console.ForegroundColor;
                Console.ForegroundColor = ConsoleColor.Red;
                Console.Write("Test Mode ONLY");
                Console.ForegroundColor = savedForegroundColor;
                Console.WriteLine(" - no files are changed. Run `Migrations run` to change files.\n");
            }

            try
            {
                List<string> projectPaths = Directory.EnumerateDirectories(syncDir).ToList();
                foreach (string projectPath in projectPaths)
                {
                    Console.WriteLine(
                        $"Project ID {projectPath.Substring(projectPath.LastIndexOf(Path.DirectorySeparatorChar) + 1)}"
                    );
                    string targetPath = Path.Combine(projectPath, "target");
                    if (!Directory.Exists(targetPath))
                    {
                        Console.WriteLine("\tNo target folder.");
                        continue;
                    }
                    Console.Write("\tTarget folder: ");
                    await ProcessUsxFilesAsync(targetPath, doWrite);

                    string sourcePath = Path.Combine(projectPath, "source");
                    if (!Directory.Exists(sourcePath))
                        continue;
                    Console.Write("\tSource folder: ");
                    await ProcessUsxFilesAsync(sourcePath, doWrite);
                }
                Console.WriteLine($"{projectPaths.Count} projects found.");
            }
            catch (UnauthorizedAccessException ex)
            {
                Console.WriteLine(ex.Message);
            }
            catch (PathTooLongException ex)
            {
                Console.WriteLine(ex.Message);
            }

            Console.WriteLine("\nFinished Migration.");
        }

        /// <summary>
        /// Migrates old USX files to the new format.
        /// </summary>
        /// <param name="path">The path to process old USX files</param>
        /// <param name="doWrite">Set true to update files</param>
        private static async Task ProcessUsxFilesAsync(string path, bool doWrite)
        {
            // The old files look like:
            // <?xml version="1.0" encoding="utf-8"?>
            // <BookText project="ENT" book="MAT" revision="3bfeac4dda2502d4730d14aa6a3c100abb3436c5">
            //   <usx version="3.0">
            //     <book code="MAT" style="id">- English Niv Test</book>
            //     <chapter number="1" style="c" />
            //     <verse number="1" style="v" />
            //     ...
            // New files are all on one line with no spaces or control characters between elements
            List<string> usxFiles = Directory.EnumerateFiles(path, "*.xml", SearchOption.TopDirectoryOnly).ToList();
            List<string> oldFiles = (
                from file in usxFiles
                let line3 = File.ReadLines(file).ElementAtOrDefault(2) ?? ""
                where line3.StartsWith(" ")
                select file
            ).ToList();
            Console.WriteLine($"{oldFiles.Count}/{usxFiles.Count} old/total files found.");

            foreach (string filePath in oldFiles)
            {
                string bookText;
                using (StreamReader reader = File.OpenText(filePath))
                {
                    bookText = await reader.ReadToEndAsync();
                }
                XElement bookTextElem = ParseText(bookText);
                if (doWrite)
                    await SaveXmlFileAsync(bookTextElem, filePath);
            }
        }

        /// <summary>
        /// Preserve all whitespace in data but remove whitespace at the beginning of lines and remove line endings.
        /// Taken as is from `ParatextSyncRunner.cs`
        /// </summary>
        private static XElement ParseText(string text)
        {
            text = text.Trim().Replace("\r\n", "\n");
            text = Regex.Replace(text, @"\n\s*<", "<", RegexOptions.CultureInvariant);
            return XElement.Parse(text, LoadOptions.PreserveWhitespace);
        }

        /// <summary>
        /// Taken as is from `ParatextSyncRunner.cs`
        /// </summary>
        private static async Task SaveXmlFileAsync(XElement bookTextElem, string fileName)
        {
            using (Stream stream = File.Create(fileName))
            {
                await bookTextElem.SaveAsync(stream, SaveOptions.DisableFormatting, CancellationToken.None);
            }
        }
    }
}
