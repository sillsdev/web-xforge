using System.Diagnostics;
using System.Net;
using System.Reflection;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Scripture.Services;

namespace ServalMigration;

/// <summary>
/// The Serval migration program.
/// </summary>
public class Program
{
    /// <summary>
    /// Gets a value indicating whether to disable migrations.
    /// </summary>
    /// <value>
    ///   <c>true</c> if migrations are disabled; otherwise, <c>false</c>.
    /// </value>
    /// <remarks>
    /// This exists for the <see cref="Startup" /> class to retrieve this value.
    /// </remarks>
    public static bool MigrationsDisabled { get; private set; }

    /// <summary>
    /// Defines the entry point of the application.
    /// </summary>
    /// <param name="args">The arguments.</param>
    public static async Task Main(string[] args)
    {
        bool doWrite = (args.Length >= 1 ? args[0] : string.Empty) == "run";
        MigrationsDisabled = !doWrite;
        string sfAppDir = args.Length >= 2 ? args[1] : string.Empty;
        string? sfProjectIdsSubset = Environment.GetEnvironmentVariable("SYNC_SET");
        string? sfAdminRequestValues = Environment.GetEnvironmentVariable("SF_PROJECT_ADMINS");
        if (string.IsNullOrWhiteSpace(sfAppDir))
        {
            // This calculated from "web-xforge\src\Migrations\ServalMigration\bin\Debug\net8.0"
            sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../../../../SIL.XForge.Scripture";
        }

        Log("Migrate Projects to Serval.");

        if (!doWrite)
        {
            Log("Test Mode ONLY - no files are changed. Run `ServalMigration run` to change files.");
            Log(string.Empty);
        }

        // Set up the web host, and start the real time server
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

        // Get the project IDs and admin IDs, if they were set in the environment variables
        string[] sfProjectIdsToMigrate = sfProjectIdsSubset?.Split(' ') ?? Array.Empty<string>();
        Dictionary<string, string> sfAdminsToUse = new Dictionary<string, string>();
        foreach (string sfAdminRequest in sfAdminRequestValues?.Split(' ') ?? Array.Empty<string>())
        {
            string[] request = sfAdminRequest.Split(':');
            sfAdminsToUse.Add(request[0], request[1]);
        }

        // Migrate all projects to Serval
        var servalMigrator = webHost.Services.GetService<ServalMigrator>();
        bool success = await servalMigrator!.MigrateAllProjectsAsync(
            doWrite,
            sfProjectIdsToMigrate,
            sfAdminsToUse,
            CancellationToken.None
        );

        // Stop the web host and real time server
        Log("Stopping Scripture Forge Server...");
        await webHost.StopAsync();

        Log(string.Empty);
        Log(success ? "Finished Migration." : "Migration Failed.");
    }

    internal static void Log(string message)
    {
        string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        Console.WriteLine(@$"{when} ServalMigration: {message}");
#if DEBUG
        Debug.WriteLine($"{when} ServalMigration: {message}");
#endif
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
                        var appAssembly = Assembly.Load(new AssemblyName(env.ApplicationName));
                        config.AddUserSecrets(appAssembly, true);
                    }

                    config.AddEnvironmentVariables();
                }
            )
            .UseConfiguration(configuration)
            .ConfigureKestrel(options =>
                // Listen to a different port than the default. Then it won't have a
                // conflict if SF is running. And specific, rather than just available, to
                // make sure we really won't be handling user requests.
                options.Listen(IPAddress.Loopback, migratorDotnetPort)
            )
            .UseStartup<Startup>();
    }
}
