using System.Net;
using System.Reflection;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Scripture.Services;

namespace WhitespaceRestoreMigration;

/// <summary>
/// SF-1444 fixes a bug where whitespace is lost when importing PT data into SF. But before the bug was fixed, past data
/// may have been imported with spaces lost. This migrator is to detect and fix those situations, where possible, by
/// re-writing the data in SF to retain those spaces.
///
/// To use the migrator and apply SF-1444, first run the migrator, which will migrate data and lock all projects. Then
/// release the SF-1444 fix. Then unlock all migrated projects (and leave projects locked that were unable to be
/// migrated for whatever reason. They should not sync until migrated so they do not push bad changes back to Paratext
/// Archives.)
///
/// Scripture Forge must be running in order to run this migrator, which uses the existing realtime server. Note that
/// "read" mode only doesn't write a migration. It does touch the local hg repo, and even temporarily disable sync on
/// projects.
///
/// Usage: cd bin/Debug/net6.0; ASPNETCORE_ENVIRONMENT=Development ./WhitespaceRestoreMigration read
/// ../../../../../SIL.XForge.Scripture
///
/// Usage on server: export SF_APP_DIR=/path/to/sf/app; sudo --user $(stat --format='%G' "${SF_APP_DIR}")
/// ASPNETCORE_ENVIRONMENT=DevelopmentORStagingORProduction time ./WhitespaceRestoreMigration read "${SF_APP_DIR}" |&
/// tee ~/output-WhitespaceRestoreMigration-$(date '+%Y%m%d-%H%M%S').txt
/// </summary>
public class Program
{
    /// <summary>
    /// Gets a value indicating whether to disable realtime server migrations.
    /// </summary>
    /// <value>
    ///   <c>true</c> if realtime server migrations are disabled; otherwise, <c>false</c>.
    /// </value>
    /// <remarks>
    /// This exists for the <see cref="Startup" /> class to retrieve this value.
    /// </remarks>
    public static bool RealtimeServerMigrationsDisabled { get; private set; }

    /// <summary>
    /// Defines the entry point of the application.
    /// </summary>
    /// <param name="args">Application arguments.</param>
    public static async Task Main(string[] args)
    {
        string usage = "Arg 1 must be 'read', 'write', or 'list-projects'. Arg 2 must be the path to the SF app dir.";
        if (args.Length < 2)
            throw new Exception($"Error: Missing required arguments. {usage}");
        bool writeMode;
        bool listProjectsMode = false;
        if (args[0] == "read")
            writeMode = false;
        else if (args[0] == "write")
            writeMode = true;
        else if (args[0] == "list-projects")
        {
            writeMode = false;
            listProjectsMode = true;
        }
        else
            throw new Exception($"Error: {usage}");
        string sfAppDir = args[1];

        RealtimeServerMigrationsDisabled = !writeMode;
        string? aspNetCoreEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        if (aspNetCoreEnv == null)
            throw new Exception($"Refusing to run unless ASPNETCORE_ENVIRONMENT is specified.");
        Log($"Operating as ASPNETCORE_ENVIRONMENT {aspNetCoreEnv}.");

        // Space-delimited set of SF project ids, to optionally specify a subset of projects to process.
        string? sfProjectIdsSubset = Environment.GetEnvironmentVariable("SF_PROJECT_SET");
        // Space-delimited set of projects and users, to optionally specify that a specific user be used when
        // processing a given project. Specify each project and user pair as the SF project id, colon, SF user id.
        string? sfUserRequestValues = Environment.GetEnvironmentVariable("SF_PROJECT_USERS");

        Log($"Running in {(writeMode ? "write mode." : "read mode.")}");

        // Set up the web host.
        Log("Starting Scripture Forge Server...");
        Directory.SetCurrentDirectory(sfAppDir);
        IWebHostBuilder builder = CreateWebHostBuilder(args);
        IWebHost webHost = builder.Build();
        try
        {
            await webHost.StartAsync();
        }
        catch (HttpRequestException)
        {
            Log("There was an error starting the program before getting to the migration" + " part. Rethrowing.");
            throw;
        }

        // Get the project IDs and user IDs, if they were set in the environment variables
        string[] sfProjectIdsToMigrate = sfProjectIdsSubset?.Split(' ') ?? Array.Empty<string>();
        Dictionary<string, string> sfUsersToUse = new Dictionary<string, string>();
        foreach (string sfUserRequest in sfUserRequestValues?.Split(' ') ?? Array.Empty<string>())
        {
            string[] request = sfUserRequest.Split(':');
            sfUsersToUse.Add(request[0], request[1]);
        }

        // Migrate projects
        var migrator = webHost.Services.GetService<Migrator>();
        bool success = await migrator!.MigrateAsync(writeMode, listProjectsMode, sfProjectIdsToMigrate, sfUsersToUse);

        // Stop the web host.
        Log("Stopping Scripture Forge Server...");
        await webHost.StopAsync();

        Log(success ? "Finished Migration." : "Migration Failed.");
    }

    internal static void Log(string message)
    {
        string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        Console.WriteLine($"{when} Migration: {message}");
    }

    private static IWebHostBuilder CreateWebHostBuilder(string[] args)
    {
        IWebHostBuilder builder = WebHost.CreateDefaultBuilder(args);

        // Secrets to connect to PT web API are associated with the SIL.XForge.Scripture assembly
        var sfAssembly = Assembly.GetAssembly(typeof(ParatextService));

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .AddUserSecrets(sfAssembly)
            .SetBasePath(Directory.GetCurrentDirectory())
            .Build();

        // Random, big number.
        int migratorDotnetPort = 39570;

        return builder
            .ConfigureAppConfiguration(
                (context, config) =>
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
                        Assembly appAssembly = Assembly.Load(new AssemblyName(env.ApplicationName));
                        config.AddUserSecrets(appAssembly, true);
                    }

                    config.AddEnvironmentVariables();
                }
            )
            .UseConfiguration(configuration)
            .ConfigureKestrel(
                options =>
                    // Listen to a different port than the default. Then it won't have a
                    // conflict if SF is running. And specific, rather than just available, to
                    // make sure we really won't be handling user requests.
                    options.Listen(IPAddress.Loopback, migratorDotnetPort)
            )
            .UseStartup<Startup>();
    }
}
