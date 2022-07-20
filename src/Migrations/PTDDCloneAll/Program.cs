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
            string modeEnv = Environment.GetEnvironmentVariable("PTDDCLONEALL_MODE");
            string mode = CloneAllService.GetMode(modeEnv);
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
                Log(
                    "There was an error starting the program before getting to the migration"
                        + " part. Maybe the SF server is running and needs shut down? Rethrowing."
                );
                throw;
            }
            await SelectProjectsAndClone(webHost, mode);
            await webHost.StopAsync();
            Log("Clone all projects - Completed");
        }

        /// <summary> Selects the SF projects to clone and clones the projects. </summary>
        public static async Task SelectProjectsAndClone(IWebHost webHost, string mode)
        {
            string cloneSubset = Environment.GetEnvironmentVariable("CLONE_SET");
            HashSet<string> projectSubset = null;
            try
            {
                if (cloneSubset != null)
                {
                    projectSubset = new HashSet<string>(cloneSubset.Split(' '));
                }
            }
            catch
            {
                Log(
                    $"There was a problem parsing the CLONE_SET SF project ids " + $"environment variable. Rethrowing."
                );
                throw;
            }
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            List<SFProject> projectsToClone = realtimeService.QuerySnapshots<SFProject>().ToList<SFProject>();
            if (projectSubset != null)
            {
                projectsToClone.RemoveAll((SFProject sfProject) => !projectSubset.Contains(sfProject.Id));
                string ids = string.Join(' ', projectsToClone.Select((SFProject sfProject) => sfProject.Id));
                int count = projectsToClone.Count;
                Log($"Only working on the subset of projects (count {count}) with these SF project ids: {ids}");
            }

            ICloneAllService cloneTool = webHost.Services.GetService<ICloneAllService>();
            await cloneTool.CloneSFProjects(mode, projectsToClone);
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
                .ConfigureAppConfiguration(
                    (context, config) =>
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
                    }
                )
                .UseConfiguration(configuration)
                .UseStartup<Startup>();
        }
    }
}
