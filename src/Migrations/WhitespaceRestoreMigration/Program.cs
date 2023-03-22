using System.Reflection;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Scripture.Services;

namespace WhitespaceRestoreMigration;

/// <summary>
/// SF-1444 fixes a bug where whitespace is lost when importing PT data into SF. But before the bug was fixed,
/// past data may have been imported with spaces lost. This migrator is to detect and fix those situations, where
/// possible, by re-writing the data in SF to retain those spaces.
///
/// Scripture Forge will need to not be running in order to run this migrator, which starts the realtime server.
/// Usage: cd bin/Debug/net6.0; ASPNETCORE_ENVIRONMENT=Development ./WhitespaceRestoreMigration
/// ASPNETCORE_ENVIRONMENT can be Development or Staging or omitted for Live.
/// Usage on server: Shut down the SF service, and then run:
///   sudo --user <user-that-runs-SF> ./WhitespaceRestoreMigration dry-run /path/to/sf/app |& tee ~/output-$(date -Is).txt
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
        bool writeMode = (args.Length >= 1 ? args[0] : string.Empty) == "run";
        RealtimeServerMigrationsDisabled = !writeMode;
        string sfAppDir = args.Length >= 2 ? args[1] : string.Empty;
        // Space-delimited set of SF project ids, to optionally specify a subset of projects to process.
        string? sfProjectIdsSubset = Environment.GetEnvironmentVariable("SF_PROJECT_SET");
        // Space-delimited set of projects and users, to optionally specify that a specific user be used when
        // processing a given project. Specify each project and user pair as the SF project id, colon, SF user id.
        string? sfUserRequestValues = Environment.GetEnvironmentVariable("SF_PROJECT_USERS");
        if (string.IsNullOrWhiteSpace(sfAppDir))
        {
            // This calculated from "web-xforge\src\Migrations\WhitespaceRestoreMigration\bin\Debug\net6.0"
            sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../../../../SIL.XForge.Scripture";
        }

        Log($"Starting in {(writeMode ? "write" : "dry-run")} mode.");
        if (!writeMode)
            Log("Operating in dry-run mode. To operate in write mode, run with arg `run`.");

        // Set up the web host, and start the realtime server
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
            Log(
                "There was an error starting the program before getting to the migration"
                    + " part. Maybe the SF server is running and needs shut down? Rethrowing."
            );
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
        bool success = await migrator!.MigrateAsync(
            writeMode,
            sfProjectIdsToMigrate,
            sfUsersToUse,
            CancellationToken.None
        );

        // Stop the web host and realtime server
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
            .UseStartup<Startup>();
    }
}
