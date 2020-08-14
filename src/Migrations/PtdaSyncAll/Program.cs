using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Scripture.Services;

namespace PtdaSyncAll
{
    /// <summary>
    /// Sync all SF projects between SF DB and Paratext Data Access Web API.
    /// This is the first step in migrating to using ParatextData.dll for sync and storing data.
    /// Fails to run if SF server is running, with error
    /// > System.Net.Http.HttpRequestException: An error occurred while sending the request.
    /// >  ---> System.IO.IOException: The response ended prematurely.
    /// This app works by starting up a subset of the regular SF services, then using SF as a library to perform tasks.
    /// </summary>
    public class Program
    {
        private static int _thisProcessId;
        public static readonly char Bullet1 = '>';
        public static readonly char Bullet2 = '*';
        public static readonly char Bullet3 = '-';

        public static async Task Main(string[] args)
        {
            using (Process thisProcess = Process.GetCurrentProcess())
            {
                _thisProcessId = thisProcess.Id;
            }
            string mode = Environment.GetEnvironmentVariable("PTDASYNCALL_MODE") ?? "inspect";
            bool doSynchronizations = mode == "sync";
            Log($"Starting. Will sync: {doSynchronizations}");
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
                Log("There was an error starting the program before getting to the inspection or migration. "
                    + "Maybe the SF server is running on this machine and needs shut down? Rethrowing.");
                throw;
            }
            var tool = new SyncAll();
            await tool.SynchronizeAllProjectsAsync(webHost, doSynchronizations);
            await webHost.StopAsync();
            Log("Done.");
        }

        /// <summary>
        /// Write message to standard output, prefixed by time and program name.
        /// </summary>
        public static void Log(string message, bool finalNewline = true)
        {
            string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            string programName = "PtdaSyncAll";
            string output = $"{when} {programName}[{_thisProcessId}]: {message}";
            if (finalNewline)
            {
                Console.WriteLine(output);
            }
            else
            {
                Console.Write(output);
            }
        }

        /// <summary>
        /// This was copied and modified from `SIL.XForge.Scripture/Program.cs`.
        /// </summary>
        public static IWebHostBuilder CreateWebHostBuilder(string[] args)
        {
            IWebHostBuilder builder = WebHost.CreateDefaultBuilder(args);

            // Secrets to connect to PT web API are associated with the SIL.XForge.Scripture assembly.
            Assembly sfAssembly = System.Reflection.Assembly.GetAssembly(typeof(ParatextService));

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
