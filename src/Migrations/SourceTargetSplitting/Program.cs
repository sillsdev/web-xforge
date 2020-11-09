namespace SourceTargetSplitting
{
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.IO;
    using System.Linq;
    using System.Net.Http;
    using System.Reflection;
    using System.Threading.Tasks;
    using System.Xml.Linq;
    using Microsoft.AspNetCore;
    using Microsoft.AspNetCore.Hosting;
    using Microsoft.Extensions.Configuration;
    using Microsoft.Extensions.DependencyInjection;
    using Microsoft.Extensions.Hosting;
    using MongoDB.Bson.Serialization;
    using SIL.XForge.Scripture.Services;
    using SIL.XForge.Services;

    /// <summary>
    /// The source/target splitting migration program.
    /// </summary>
    public class Program
    {
        /// <summary>
        /// The object migrator.
        /// </summary>
        private static IObjectMigrator? objectMigrator;

        /// <summary>
        /// Defines the entry point of the application.
        /// </summary>
        /// <param name="args">The arguments.</param>
        public static async Task Main(string[] args)
        {
            const string siteDir = "/var/lib/scriptureforge";
            string syncDir = Path.Combine(siteDir, "sync");
            bool doWrite = (args.Length >= 1 ? args[0] : string.Empty) == "run";
            string sfAppDir = args.Length >= 2 ? args[1] : string.Empty;
            if (string.IsNullOrWhiteSpace(sfAppDir))
            {
                // This calculated from "web-xforge\src\Migrations\SourceTargetSplitting\bin\Debug\netcoreapp3.1"
                sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../../../../SIL.XForge.Scripture";
            }

            Log("Split Source and Target Projects.");
            Log(string.Empty);
            if (!Directory.Exists(siteDir))
            {
                Log($"Site folder doesn't exist: {siteDir}");
                Environment.Exit(1);
            }

            if (!Directory.Exists(syncDir))
            {
                Log($"Sync folder doesn't exist: {syncDir}");
                Environment.Exit(1);
            }

            if (!doWrite)
            {
                Log("Test Mode ONLY - no files are changed. Run `SourceTargetSplitting run` to change files.");
                Log(string.Empty);
            }

            // Set up the web host, and start the real time server
            Log("Starting ScriptureForge Server...");
            Directory.SetCurrentDirectory(sfAppDir);
            IWebHostBuilder builder = CreateWebHostBuilder(args);
            IWebHost webHost = builder.Build();
            try
            {
                await webHost.StartAsync();
            }
            catch (HttpRequestException)
            {
                Log("There was an error starting the program before getting to the migration"
                    + " part. Maybe the SF server is running and needs shut down? Rethrowing.");
                throw;
            }

            // The following serializer is required for serializing TextData
            BsonSerializer.RegisterSerializer(new JTokenSerializer());

            // Get the object migrator
            objectMigrator = webHost.Services.GetService<IObjectMigrator>();

            // Migrate the files, and get a list of source mappings so we can migrate the database objects
            await MigrateFilesAsync(syncDir, doWrite).ConfigureAwait(false);

            // Migrate the database objects
            await objectMigrator.MigrateObjectsAsync(doWrite).ConfigureAwait(false);

            // Stop the web host and real time server
            Log("Stopping ScriptureForge Server...");
            await webHost.StopAsync();

            Log(string.Empty);
            Log("Finished Migration.");
        }

        public static IWebHostBuilder CreateWebHostBuilder(string[] args)
        {
            IWebHostBuilder builder = WebHost.CreateDefaultBuilder(args);

            // Secrets to connect to PT web API are associated with the SIL.XForge.Scripture assembly
            var sfAssembly = Assembly.GetAssembly(typeof(ParatextService));

            IConfigurationRoot configuration = new ConfigurationBuilder()
                .AddUserSecrets(sfAssembly)
                .SetBasePath(Directory.GetCurrentDirectory())
                .Build();

            return builder
                .ConfigureAppConfiguration((context, config) =>
                {
                    IWebHostEnvironment env = context.HostingEnvironment;
                    if (env.IsDevelopment() || env.IsEnvironment("Testing"))
                    {
                        config.AddJsonFile("appsettings.user.json", true);
                    }
                    else
                    {
                        config.AddJsonFile("secrets.json", true, true);
                    }

                    if (env.IsEnvironment("Testing"))
                    {
                        var appAssembly = Assembly.Load(new AssemblyName(env.ApplicationName));
                        if (appAssembly != null)
                            config.AddUserSecrets(appAssembly, true);
                    }

                    config.AddEnvironmentVariables();
                })
                .UseConfiguration(configuration)
                .UseStartup<Startup>();
        }

        /// <summary>
        /// Migrates the files.
        /// </summary>
        /// <param name="syncDir">The synchronize dir.</param>
        /// <param name="doWrite">If set to <c>true</c>, do write changes to the file system.</param>
        public static async Task MigrateFilesAsync(string syncDir, bool doWrite)
        {
            try
            {
                List<string> projectIds = new List<string>();
                List<string> projectPaths = Directory.EnumerateDirectories(syncDir).ToList();

                // Iterate over the project paths to get the project IDs
                foreach (string projectPath in projectPaths)
                {
                    string projectId = Path.GetFileName(projectPath.TrimEnd(Path.DirectorySeparatorChar));
                    string targetPath = Path.Combine(projectPath, "target");
                    if (Directory.Exists(targetPath))
                    {
                        projectIds.Add(projectId);
                    }
                    else
                    {
                        continue;
                    }
                }

                // Iterate over the project paths to split the source
                foreach (string projectPath in projectPaths)
                {
                    string projectId = Path.GetFileName(projectPath.TrimEnd(Path.DirectorySeparatorChar));
                    Log($"Directory {projectId}");

                    // Check for the target path
                    string targetPath = Path.Combine(projectPath, "target");
                    if (!Directory.Exists(targetPath))
                    {
                        Log("\tNo target folder - skipping as this is not a project");
                        continue;
                    }

                    // Check for the source path
                    string sourcePath = Path.Combine(projectPath, "source");
                    if (!Directory.Exists(sourcePath))
                    {
                        Log("\tNo source folder - no need to split");
                        continue;
                    }

                    // See if there are files in the soruce directory
                    if (Directory.GetFiles(sourcePath, "*", SearchOption.AllDirectories).Length == 0)
                    {
                        Log("\tNo files in source folder - deleting source directory");
                        if (doWrite)
                        {
                            Directory.Delete(sourcePath, true);
                        }

                        continue;
                    }

                    // Get the source project id (if a resource)
                    string? sourceProjectId = null;
                    string dblIdDirectoryPath = Path.Combine(sourcePath, ".dbl", "id");
                    if (Directory.Exists(dblIdDirectoryPath))
                    {
                        string[] files = Directory.GetFiles(dblIdDirectoryPath, "*");
                        if (files.Length == 1)
                        {
                            if (Path.GetExtension(files.First()) == string.Empty)
                            {
                                sourceProjectId = Path.GetFileName(files.First());
                            }
                            else
                            {
                                Log("\tThe .dbl/id directory has the wrong file in it");
                            }
                        }
                        else
                        {
                            Log("\tThe .dbl directory was found, but the id directory has more than one file");
                        }
                    }

                    // If we couldn't get the id, this is a project
                    if (sourceProjectId == null)
                    {
                        // Check for the source settings file
                        string settingsXmlPath = Path.Combine(sourcePath, "Settings.xml");
                        if (!File.Exists(settingsXmlPath))
                        {
                            Log("\tNo Settings.xml in the source folder - cannot split project");
                            continue;
                        }

                        // Get the source project id (if a project)
                        XDocument settingsXmlDocument = XDocument.Load(settingsXmlPath);
                        sourceProjectId = settingsXmlDocument.Descendants("Guid").FirstOrDefault()?.Value;
                        if (string.IsNullOrWhiteSpace(sourceProjectId))
                        {
                            Log("\tNo Guid element in the source folder's Settings.xml - cannot split project");
                            continue;
                        }
                    }

                    // If we do not have the source project, create it, otherwise, delete it
                    if (!projectIds.Contains(sourceProjectId))
                    {
                        Log($"\tMoving source directory to its own project: {sourceProjectId}");
                        string newProjectDirectoryPath = Path.Combine(syncDir, sourceProjectId);
                        string newProjectTargetDirectoryPath = Path.Combine(newProjectDirectoryPath, "target");
                        if (doWrite)
                        {
                            Directory.CreateDirectory(newProjectDirectoryPath);
                            Directory.Move(sourcePath, newProjectTargetDirectoryPath);
                            try
                            {
                                await objectMigrator!.CreateProjectFromSourceAsync(sourceProjectId, projectId).ConfigureAwait(false);
                            }
                            catch (DataNotFoundException ex)
                            {
                                Log(ex.Message);
                            }
                        }

                        projectIds.Add(sourceProjectId);
                    }
                    else
                    {
                        // Remove the source directory
                        Log("\tSource directory already exists as a project, deleting and migrating permissions");
                        if (doWrite)
                        {
                            await objectMigrator!.MigrateTargetPermissionsAsync(sourceProjectId, projectId).ConfigureAwait(false);
                            Directory.Delete(sourcePath, true);
                        }

                        continue;
                    }
                }
            }
            catch (UnauthorizedAccessException ex)
            {
                Log(ex.Message);
            }
            catch (PathTooLongException ex)
            {
                Log(ex.Message);
            }
        }

        /// <summary>
        /// Logs the specified message.
        /// </summary>
        /// <param name="message">The message.</param>
        /// <remarks>
        /// The message is logged to the console.
        /// </remarks>
        public static void Log(string message)
        {
            string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            Console.WriteLine($"{when} SourceTargetSplitting: {message}");
#if DEBUG
            Debug.WriteLine($"{when} SourceTargetSplitting: {message}");
#endif
        }
    }
}
