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
        const string CLONE = "clone";
        const string CLONE_AND_MOVE_OLD = "cloneandmoveold";
        const string CLONE_SILENT = "clonesilent";
        const string INSPECT = "inspect";

        public static async Task Main(string[] args)
        {
            string modeEnv = Environment.GetEnvironmentVariable("PTDDCLONEALL_MODE");
            string mode = modeEnv == CLONE || modeEnv == CLONE_AND_MOVE_OLD || modeEnv == CLONE_SILENT ? modeEnv : INSPECT;
            Log($"PTDDCloneAll starting. Migration mode: {mode}");
            string sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../SIL.XForge.Scripture";
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
            await CloneSFProjects(webHost, mode);
            await webHost.StopAsync();
            Log("Clone all projects - Completed");
        }

        /// <summary>
        /// Iterates through all SF projects on the server and identifies one administrator user on the project.
        /// Using the administrator user's secrets, perform a send/receive with the Paratext server. Effectively,
        /// this clones the project to the Scripture Forge server.
        /// Text documents in the SF DB for Scripture texts are deleted and recreated from the up-to-date Paratext project data after
        /// cloning. This will overwrite any un-synchronized data on SF.
        /// </summary>
        public static async Task CloneSFProjects(IWebHost webHost, string mode)
        {
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            IQueryable<SFProject> allSFProjects = realtimeService.QuerySnapshots<SFProject>();
            IOptions<SiteOptions> siteOptions = webHost.Services.GetService<IOptions<SiteOptions>>();
            IParatextService paratextService = webHost.Services.GetService<IParatextService>();
            IRepository<UserSecret> userSecretRepo = webHost.Services.GetService<IRepository<UserSecret>>();
            string syncDir = Path.Combine(siteOptions.Value.SiteDir, "sync");
            bool doClone = mode == CLONE || mode == CLONE_AND_MOVE_OLD || mode == CLONE_SILENT;

            string syncDirOld = Path.Combine(siteOptions.Value.SiteDir, "sync_old");
            if (mode == CLONE_AND_MOVE_OLD)
            {
                if (!Directory.Exists(syncDirOld))
                    Directory.CreateDirectory(syncDirOld);
            }

            IConnection connection = await realtimeService.ConnectAsync();
            // Get the paratext project ID and admin user for all SF Projects
            foreach (SFProject proj in allSFProjects)
            {
                bool foundAdmin = false;
                foreach (string userId in proj.UserRoles.Keys)
                {
                    if (proj.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Administrator)
                    {
                        foundAdmin = true;
                        UserSecret userSecret = userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == userId);
                        string ptUsername = paratextService.GetParatextUsername(userSecret);
                        Log($"Project administrator identified on {proj.Name}: {ptUsername} ({userId})");
                        if (!doClone)
                            break;
                        try
                        {
                            var projectDoc = await connection.FetchAsync<SFProject>(proj.Id);
                            await projectDoc.SubmitJson0OpAsync(op =>
                            {
                                // Increment the queued count such as in SyncService
                                op.Inc(pd => pd.Sync.QueuedCount);
                            });
                            bool silent = mode == CLONE_SILENT;
                            // Clone the paratext project and update the SF database with the project data
                            await CloneAndSyncFromParatext(webHost, proj, userId, syncDir, silent);

                            if (mode == CLONE_AND_MOVE_OLD)
                            {
                                string projectDir = Path.Combine(syncDir, proj.Id);
                                string projectDirOld = Path.Combine(syncDirOld, proj.Id);
                                Directory.Move(projectDir, projectDirOld);
                            }
                            break;
                        }
                        catch (Exception e)
                        {
                            Log($"Unable to clone {proj.Name} ({proj.Id}) as user: {userId}{Environment.NewLine}" +
                                $"Error was: {e}");
                        }
                    }
                }
                if (!foundAdmin)
                    Log($"ERROR: Unable to identify a project administrator on {proj.Name}");
            }
        }

        /// <summary>
        /// Clone Paratext project data into the SF projects sync folder. Then synchronize existing books
        /// and notes in project.
        /// </summary>
        public static async Task CloneAndSyncFromParatext(IWebHost webHost, SFProject proj, string userId,
            string syncDir, bool silent)
        {
            Log($"Cloning {proj.Name} ({proj.Id}) as SF user {userId}");
            string partialCloneDir = Path.Combine(syncDir, proj.ParatextId);
            try
            {
                PTDDSyncRunner syncRunner = webHost.Services.GetService<PTDDSyncRunner>();
                await syncRunner.RunAsync(proj.Id, userId, false, silent);
                Log($"{proj.Name} - Succeeded");
                if (silent)
                {
                    Log($"Deleting cloned repository for {proj.Name}");
                    Directory.Delete(partialCloneDir, true);
                }
            }
            catch (Exception e)
            {
                Log($"There was a problem cloning the project.{Environment.NewLine}Exception is: {e}");
                if (Directory.Exists(partialCloneDir))
                    Directory.Delete(partialCloneDir, true);
                throw;
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
                        config.AddEnvironmentVariables();
                    })
                .UseConfiguration(configuration)
                .UseStartup<Startup>();
        }
    }
}
