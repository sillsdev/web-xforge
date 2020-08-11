using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Autofac;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
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
            await SynchronizeAllProjects(webHost, doSynchronizations);
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
        /// First-stage migrator. Synchronize all SF projects to the Paratext Data Access server.
        /// First query information that will show whether we should be able to sync all projects. In addition to
        /// reporting information on projects and whether there is an admin that can sync the project, this method shows
        /// that the admin can successfully perform queries to both the PT Registry and the PT Data Access web APIs, via
        /// various ParatextService method calls.
        /// If `doSynchronizations` is false, only do the above reporting. If true, also synchronize the SF DB with the
        /// Paratext Data Access server.
        /// </summary>
        public static async Task SynchronizeAllProjects(IWebHost webHost, bool doSynchronizations)
        {
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            IParatextService paratextService = webHost.Services.GetService<IParatextService>();
            IRepository<UserSecret> userSecretRepo = webHost.Services.GetService<IRepository<UserSecret>>();
            IQueryable<SFProject> allSfProjects = realtimeService.QuerySnapshots<SFProject>();
            char bullet1 = '>';
            char bullet2 = '*';
            char bullet3 = '-';

            // Report on all SF projects.
            foreach (SFProject sfProject in allSfProjects)
            {
                Log($"{bullet1} PT project {sfProject.ShortName}, "
                    + $"PT project id {sfProject.ParatextId}, SF project id {sfProject.Id}.");
                IEnumerable<string> projectSfAdminUserIds = sfProject.UserRoles
                    .Where(ur => ur.Value == SFProjectRole.Administrator).Select(ur => ur.Key);
                if (projectSfAdminUserIds.Count() < 1)
                {
                    IEnumerable<string> projectSfUserIds = sfProject.UserRoles.Select(ur => ur.Key);
                    string users = string.Join(", ", projectSfUserIds);
                    if (projectSfUserIds.Count() < 1)
                    {
                        users = "None";
                    }
                    Log($"  {bullet2} Warning: no admin users. Non-admin users include: {users}");
                }

                // Report on all admins in a project
                foreach (string sfUserId in projectSfAdminUserIds)
                {
                    UserSecret userSecret = userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);
                    string ptUsername = null;
                    string ptUserId = null;
                    try
                    {
                        ptUsername = paratextService.GetParatextUsername(userSecret);
                        ptUserId = GetParatextUserId(userSecret);
                    }
                    catch (Exception e)
                    {
                        Log($"  {bullet2} Failure getting SF user's PT username or PT user id. " +
                            $"Skipping. SF user id was {sfUserId}. If known, PT username was {ptUsername}. " +
                            $"Error with stack was {e}");
                        continue;
                    }
                    Log($"  {bullet2} PT user '{ptUsername}', "
                        + $"id {ptUserId}, using SF admin user id {sfUserId} on SF project.");

                    string rt = $"{userSecret.ParatextTokens.RefreshToken.Substring(0, 5)}..";
                    string at = $"{userSecret.ParatextTokens.AccessToken.Substring(0, 5)}..";
                    bool atv = userSecret.ParatextTokens.ValidateLifetime();
                    Log($"    {bullet3} Paratext RefreshToken: {rt}, "
                        + $"AccessToken: {at}, AccessToken initially valid: {atv}.");

                    // Demonstrate access to PT Registry, and report Registry's statement of role.
                    Log($"    {bullet3} PT Registry report on role on PT project: ", false);
                    IReadOnlyDictionary<string, string> ptProjectRoles = null;
                    try
                    {
                        ptProjectRoles = await paratextService.GetProjectRolesAsync(userSecret, sfProject.ParatextId);
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"      Failure fetching user's PT project roles. Skipping. " +
                            $"Error was {e.Message}");
                        continue;
                    }
                    if (ptProjectRoles.TryGetValue(ptUserId, out string ptRole))
                    {
                        Console.WriteLine($"{ptRole}");
                    }
                    else
                    {
                        Console.WriteLine($"Not found.");
                    }
                    // Demonstrate access to PT Data Access.
                    IReadOnlyList<ParatextProject> userPtProjects = null;
                    try
                    {
                        userPtProjects = await paratextService.GetProjectsAsync(userSecret);
                    }
                    catch (Exception e)
                    {
                        Log($"    {bullet3} Failure fetching user's PT projects. Skipping. Error was {e.Message}");
                        continue;
                    }

                    Log($"    {bullet3} PT Data Access and PT Registry "
                        + "based report on projects the user can access, narrowed to this project: ", false);
                    IEnumerable<string> ptProjectNamesList = userPtProjects
                        .Where(ptProject => ptProject.ParatextId == sfProject.ParatextId)
                        .Select(ptProject => ptProject.ShortName);
                    string ptProjectNames = string.Join(',', ptProjectNamesList);
                    if (ptProjectNamesList.Count() < 1)
                    {
                        ptProjectNames = $"User is not on this project. " +
                            $"PT reports they are on this many PT projects: {userPtProjects.Count()}";
                    }
                    Console.WriteLine(ptProjectNames);

                    if (doSynchronizations)
                    {
                        Log($"  {bullet2} Synchronizing SF project {sfProject.Id} as SF user {sfUserId} ...");
                        try
                        {
                            await SynchronizeProject(webHost, sfUserId, sfProject.Id);
                            Log($"    {bullet3} Done synchronization with no thrown exceptions.");
                            break;
                        }
                        catch (Exception e)
                        {
                            Log($"    {bullet3} There was a problem with synchronizing. It might be tried next with "
                                + $"another admin user. Exception is:{Environment.NewLine}{e}");
                            continue;
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Synchronize project between SF DB and Paratext Data Access server.
        /// </summary>
        public static Task SynchronizeProject(IWebHost webHost, string sfUserId, string sfProjectId)
        {
            var syncRunner = webHost.Services.GetService<ParatextSyncRunner>();
            return syncRunner.RunAsync(sfProjectId, sfUserId, false);
        }

        /// <summary>
        /// As claimed by tokens in userSecret. Looks like it corresponds to `userId` in PT Registry project members
        /// query.
        /// </summary>
        private static string GetParatextUserId(UserSecret userSecret)
        {
            if (userSecret.ParatextTokens == null)
                return null;
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim claim = accessToken.Claims.FirstOrDefault(c => c.Type == "sub");
            return claim?.Value;
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
                    })
                .UseConfiguration(configuration)
                .UseStartup<Startup>();
        }
    }
}
