using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Xml.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using SIL.XForge;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;


namespace PTDDCloneAll
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            string mode = Environment.GetEnvironmentVariable("PTDDCLONEALL_MODE") ?? "inspect";
            bool doClone = mode == "clone";
            Console.WriteLine($"PTDDCloneAll starting. Will clone: {doClone}");
            string sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../SIL.XForge.Scripture";
            Directory.SetCurrentDirectory(sfAppDir);
            IWebHostBuilder builder = CreateWebHostBuilder(args);
            IWebHost webHost = builder.Build();
            await webHost.StartAsync();
            await CloneSFProjects(webHost, doClone);
            await webHost.StopAsync();
            Console.WriteLine("Clone all projects: Completed");
        }

        /// <summary>
        /// Iterates through all SF projects on the server and identifies one administrator user on the project.
        /// Using the administrator user's secrets, perform a send/receive with the Paratext server. Effectively,
        /// this clones the project to the Scripture Forge server.
        /// Text documents for Scripture texts are deleted and recreated from the up-to-date Paratext project data after
        /// cloning. This will overwrite any un-synchronized data on SF.
        /// </summary>
        public static async Task CloneSFProjects(IWebHost webHost, bool doClone)
        {
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            IQueryable<SFProject> allSFProjects = realtimeService.QuerySnapshots<SFProject>();
            ParatextSyncRunner syncRunner = webHost.Services.GetService<ParatextSyncRunner>();
            IOptions<SiteOptions> siteOptions = webHost.Services.GetService<IOptions<SiteOptions>>();
            string syncDir = Path.Combine(siteOptions.Value.SiteDir, "sync");
            string syncDirOld = Path.Combine(siteOptions.Value.SiteDir, "sync_old");

            if (doClone)
            {
                if (!Directory.Exists(syncDirOld))
                    Directory.CreateDirectory(syncDirOld);
            }

            IConnection connection = await realtimeService.ConnectAsync();
            List<string> projectCloneResults = new List<string>();
            string migrationStatus;
            // Get the paratext project ID and admin user for all SF Projects
            foreach (SFProject proj in allSFProjects)
            {
                migrationStatus = "Failed to find project administrator.";
                foreach (string userId in proj.UserRoles.Keys)
                {
                    if (proj.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Administrator)
                    {
                        migrationStatus = $"Project administrator identified: {userId}";
                        if (!doClone)
                            break;
                        try
                        {
                            // Delete the TextDocs in the SF project
                            var projectDoc = await connection.FetchAsync<SFProject>(proj.Id);
                            foreach (TextInfo text in projectDoc.Data.Texts)
                            {
                                if (text.HasSource)
                                    await DeleteAllTextDocsForBookAsync(connection, proj.Id, text, TextType.Source);
                                await DeleteAllTextDocsForBookAsync(connection, proj.Id, text, TextType.Target);
                            }
                            await projectDoc.SubmitJson0OpAsync(op =>
                            {
                                op.Set(pd => pd.Texts, new List<TextInfo>());
                                // Increment the queued count such as in SyncService
                                op.Inc(pd => pd.Sync.QueuedCount);
                            });
                            // Clone the paratext project and update the SF database with the project data
                            await CloneAndSyncSFToParatext(syncRunner, proj.Id, userId);
                            string projectDir = Path.Combine(syncDir, proj.Id);
                            string projectDirOld = Path.Combine(syncDirOld, proj.Id);
                            Directory.Move(projectDir, projectDirOld);
                            migrationStatus = "Succeeded";
                        }
                        catch (Exception e)
                        {
                            string partialCloneDir = Path.Combine(syncDir, proj.ParatextId);
                            if (Directory.Exists(partialCloneDir))
                                Directory.Delete(partialCloneDir);
                            migrationStatus = $"Error: {e.Message}";
                        }
                        break;
                    }
                }
                projectCloneResults.Add($"{proj.Name} - {migrationStatus}");
            }
            Console.WriteLine("MIGRATION RESULTS:");
            foreach (string result in projectCloneResults)
            {
                Console.WriteLine(result);
            }
        }

        public static async Task CloneAndSyncSFToParatext(ParatextSyncRunner syncRunner, string projectId, string userId)
        {
            await syncRunner.RunAsync(projectId, userId, false);
        }

        public static IWebHostBuilder CreateWebHostBuilder(string[] args)
        {
            IWebHostBuilder builder = WebHost.CreateDefaultBuilder(args);

            // Secrets to connect to PT web API are associated with the SIL.XForge.Scripture assembly
            Assembly sfAssembly = Assembly.GetAssembly(typeof(ParatextService));

            IConfigurationRoot configuration = new ConfigurationBuilder()
                .AddUserSecrets(sfAssembly)
                .SetBasePath(Directory.GetCurrentDirectory())
                .Build();

            return builder
                .ConfigureAppConfiguration((context, config) =>
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
                    })
                .UseConfiguration(configuration)
                .UseStartup<Startup>();
        }

        /// <summary>
        /// Deletes all text docs from the database for a book. Copied and modified from ParatextSyncRunner.cs
        /// </summary>
        public static async Task DeleteAllTextDocsForBookAsync(IConnection connection, string sfProjectId, TextInfo text, TextType textType)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
                tasks.Add(DeleteTextDocAsync(connection, sfProjectId, text, chapter.Number, textType));
            await Task.WhenAll(tasks);
        }

        // Copied and modified from ParatextSyncRunner.cs
        public static IDocument<TextData> GetTextDoc(IConnection connection, string sfProjectId, TextInfo text, int chapter, TextType textType)
        {
            return connection.Get<TextData>(TextData.GetTextDocId(sfProjectId, text.BookNum, chapter, textType));
        }

        // Copied and modified from ParatextSyncRunner.cs
        public static async Task DeleteTextDocAsync(IConnection connection, string sfProjectId, TextInfo text, int chapter, TextType textType)
        {
            IDocument<TextData> textDoc = GetTextDoc(connection, sfProjectId, text, chapter, textType);
            await textDoc.FetchAsync();
            if (textDoc.IsLoaded)
                await textDoc.DeleteAsync();
        }
    }
}
