using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Services;

namespace PtdaToPtdd
{
    /// <summary>
    /// Migrate SF project data from being used via
    /// Paratext Data Access Web Api, to being used via
    /// ParatextData.dll.
    /// </summary>
    public class Program
    {
        public static async Task Main(string[] args)
        {
            Directory.SetCurrentDirectory("../../SIL.XForge.Scripture");
            IWebHostBuilder builder = SIL.XForge.Scripture.Program.CreateWebHostBuilder(args);
            IWebHost webHost = builder.Build();
            webHost.Start();
            await PtdaToPtdd.Program.MigrateAsync(webHost);
            Console.WriteLine("Migrator done.");
        }
        public static async Task MigrateAsync(IWebHost webHost)
        {
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            IParatextService paratextService = webHost.Services.GetService<IParatextService>();
            IRepository<UserSecret> userSecretRepo = webHost.Services.GetService<IRepository<UserSecret>>();
            IQueryable<SFProject> allProjects = realtimeService.QuerySnapshots<SFProject>();
            foreach (SFProject project in allProjects)
            {
                Console.WriteLine($"SF Project id {project.Id} ShortName {project.ShortName} ptId {project.ParatextId}");
                IEnumerable<string> projectSfAdminUserIds = project.UserRoles
                    .Where(ur => ur.Value == "pt_administrator")
                    .Select(ur => ur.Key);
                foreach (string sfUserId in projectSfAdminUserIds)
                {
                    Console.WriteLine($"  Admin user: {sfUserId}");
                    UserSecret userSecret = userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);

                    Console.WriteLine($"    ParatextTokens:");
                    Console.WriteLine($"      AccessToken: {userSecret.ParatextTokens.AccessToken}");
                    Console.WriteLine($"        Still valid: {userSecret.ParatextTokens.ValidateLifetime()}");
                    Console.WriteLine($"      RefreshToken: {userSecret.ParatextTokens.RefreshToken}");
                    IReadOnlyDictionary<string, string> userPtProjectRoles =
                        await paratextService.GetProjectRolesAsync(userSecret, project.ParatextId);
                    Console.WriteLine($"    Roles on PT project:");
                    foreach (KeyValuePair<string, string> ptProjectRole in userPtProjectRoles)
                    {
                        Console.WriteLine($"      {ptProjectRole}");
                    }
                    Console.WriteLine($"    AccessToken is valid now: {userSecret.ParatextTokens.ValidateLifetime()}");
                }
            }
        }
    }
}
