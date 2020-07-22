using System;
using System.Collections.Generic;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using MongoDB.Driver;
using SIL.XForge;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture;
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
        public static async Task Main(string[] args)
        {
            string sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../SIL.XForge.Scripture";
            Directory.SetCurrentDirectory(sfAppDir);
            // Can alternatively use the SF startup configurations:
            // IWebHostBuilder builder = SIL.XForge.Scripture.Program.CreateWebHostBuilder(args);
            IWebHostBuilder builder = CreateWebHostBuilder(args);
            IWebHost webHost = builder.Build();
            webHost.Start();
            await Inquiry(webHost);
            Console.WriteLine("Migrator done.");
        }

        /// <summary>
        /// Query information that will show whether we should be able to sync all projects. In addition to reporting
        /// information on projects and whether there is an admin that can sync the project, this method  shows that
        /// the admin can successfully perform queries to both the PT Registry and the PT Data Access web APIs, via
        /// various ParatextService method calls.
        /// </summary>
        public static async Task Inquiry(IWebHost webHost)
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
                Console.WriteLine($"{bullet1} PT project {sfProject.ShortName}, "
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
                    Console.WriteLine($"  {bullet2} Warning: no admin users. Non-admin users include: {users}");
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
                        Console.WriteLine($"  Failure. Skipping. Error was {e.Message}");
                        continue;
                    }
                    Console.WriteLine($"  {bullet2} PT user '{ptUsername}', "
                        + $"id {ptUserId}, using SF admin user id {sfUserId} on SF project.");

                    string rt = $"{userSecret.ParatextTokens.RefreshToken.Substring(0, 5)}..";
                    string at = $"{userSecret.ParatextTokens.AccessToken.Substring(0, 5)}..";
                    bool atv = userSecret.ParatextTokens.ValidateLifetime();
                    Console.WriteLine($"    {bullet3} Paratext RefreshToken: {rt}, "
                        + $"AccessToken: {at}, AccessToken initially valid: {atv}.");

                    // Demonstrate access to PT Registry, and report Registry's statement of role.
                    Console.Write($"    {bullet3} PT Registry report on role on PT project: ");
                    IReadOnlyDictionary<string, string> ptProjectRoles = null;
                    try
                    {
                        ptProjectRoles = await paratextService.GetProjectRolesAsync(userSecret, sfProject.ParatextId);
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"      Failure. Skipping. Error was {e.Message}");
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
                        Console.WriteLine($"    Failure. Skipping. Error was {e.Message}");
                        continue;
                    }

                    Console.Write($"    {bullet3} PT Data Access and PT Registry "
                        + "based report on projects the user can access, narrowed to this project: ");
                    IEnumerable<string> ptProjectNamesList = userPtProjects
                        .Where(ptProject => ptProject.ParatextId == sfProject.ParatextId)
                        .Select(ptProject => ptProject.ShortName);
                    string ptProjectNames = string.Join(',', ptProjectNamesList);
                    if (ptProjectNamesList.Count() < 1)
                    {
                        ptProjectNames = "None.";
                    }
                    Console.WriteLine(ptProjectNames);
                }
            }
        }

        public static void MigrateAsync(IWebHost webHost)
        {
            throw new NotImplementedException();
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
            string environment = builder.GetSetting("environment");

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

        /// <summary>
        /// This was copied and modified from `SIL.XForge.Scripture/Startup.cs`.
        /// </summary>
        public class Startup
        {
            public Startup(IConfiguration configuration, IWebHostEnvironment env, ILoggerFactory loggerFactory)
            {
                Configuration = configuration;
                Environment = env;
                LoggerFactory = loggerFactory;
            }

            public IConfiguration Configuration { get; }
            public IWebHostEnvironment Environment { get; }
            public ILoggerFactory LoggerFactory { get; }
            public IContainer ApplicationContainer { get; private set; }

            private bool IsDevelopment => Environment.IsDevelopment() || Environment.IsEnvironment("Testing");

            public IServiceProvider ConfigureServices(IServiceCollection services)
            {
                var containerBuilder = new ContainerBuilder();

                services.AddExceptionReporting(Configuration);

                services.AddConfiguration(Configuration);

                services.AddSFRealtimeServer(LoggerFactory, Configuration, IsDevelopment);

                services.AddSFServices();

                services.AddSFDataAccess(Configuration);

                services.Configure<RequestLocalizationOptions>(
                    opts =>
                    {
                        var supportedCultures = new List<CultureInfo>();
                        foreach (var culture in SharedResource.Cultures)
                        {
                            supportedCultures.Add(new CultureInfo(culture.Key));
                        }

                        opts.DefaultRequestCulture = new RequestCulture("en");
                        // Formatting numbers, dates, etc.
                        opts.SupportedCultures = supportedCultures;
                        // UI strings that we have localized.
                        opts.SupportedUICultures = supportedCultures;
                    });

                containerBuilder.Populate(services);
                ApplicationContainer = containerBuilder.Build();
                return new AutofacServiceProvider(ApplicationContainer);
            }

            public void Configure(IApplicationBuilder app, IHostApplicationLifetime appLifetime,
                IExceptionHandler exceptionHandler)
            {
                IOptions<SiteOptions> siteOptions = app.ApplicationServices.GetService<IOptions<SiteOptions>>();
                app.UseRealtimeServer();
                app.UseSFDataAccess();
                appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
            }
        }
    }
}
