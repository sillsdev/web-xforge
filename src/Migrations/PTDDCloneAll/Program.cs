using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
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
            try
            {
                await webHost.StartAsync();
            }
            catch (HttpRequestException e)
            {
                Log("There was an error starting the program before getting to the migration"
                    + " part. Maybe the SF server is running and needs shut down? Rethrowing.");
                throw e;
            }
            await CloneSFProjects(webHost, doClone);
            await webHost.StopAsync();
            Log("Clone all projects - Completed");
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
            IOptions<SiteOptions> siteOptions = webHost.Services.GetService<IOptions<SiteOptions>>();
            string syncDir = Path.Combine(siteOptions.Value.SiteDir, "sync");
            string syncDirOld = Path.Combine(siteOptions.Value.SiteDir, "sync_old");

            if (doClone)
            {
                if (!Directory.Exists(syncDirOld))
                    Directory.CreateDirectory(syncDirOld);
            }

            IConnection connection = await realtimeService.ConnectAsync();
            // Get the paratext project ID and admin user for all SF Projects
            foreach (SFProject proj in allSFProjects)
            {
                foreach (string userId in proj.UserRoles.Keys)
                {
                    if (proj.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Administrator)
                    {
                        Console.WriteLine($"Project administrator identified on {proj.Name}: {userId}");
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
                            await CloneAndSyncSFToParatext(webHost, proj, userId, syncDir);
                            string projectDir = Path.Combine(syncDir, proj.Id);
                            string projectDirOld = Path.Combine(syncDirOld, proj.Id);
                            Directory.Move(projectDir, projectDirOld);
                        }
                        catch (Exception e)
                        {
                            Log($"There was an error setting up {proj.Name} ({proj.Id}) to be cloned. Skipping. " +
                                $"Error was {e.Message}");
                        }
                        break;
                    }
                }
            }
        }

        public static async Task CloneAndSyncSFToParatext(IWebHost webHost, SFProject proj, string userId, string syncDir)
        {
            try
            {
                Console.WriteLine($"Cloning {proj.Name} ({proj.Id}) as SF user {userId}");
                ParatextSyncRunner syncRunner = webHost.Services.GetService<ParatextSyncRunner>();
                await syncRunner.RunAsync(proj.Id, userId, false);
                Log($"{proj.Name} - Succeeded");
            }
            catch (Exception e)
            {
                Log($"There was a problem cloning the project. Exception is:\n${e}");
                string partialCloneDir = Path.Combine(syncDir, proj.ParatextId);
                if (Directory.Exists(partialCloneDir))
                    Directory.Delete(partialCloneDir);
            }
        }

        public static void Log(string message)
        {
            string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            Console.WriteLine($"{when} PTDDCloneAll: {message}");
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
