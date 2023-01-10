using System.Diagnostics;
using System.Reflection;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SIL.XForge.Scripture.Services;

namespace MachineApiMigration;

/// <summary>
/// The Machine API migration program.
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
            // This calculated from "web-xforge\src\Migrations\MachineApiMigration\bin\Debug\net6.0"
            sfAppDir = Environment.GetEnvironmentVariable("SF_APP_DIR") ?? "../../../../../SIL.XForge.Scripture";
        }

        Log("Migrate Projects to Machine API.");

        if (!doWrite)
        {
            Log("Test Mode ONLY - no files are changed. Run `MachineApiMigration run` to change files.");
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

        // Migrate all projects to the new Machine API
        var machineApiMigrator = webHost.Services.GetService<MachineApiMigrator>();
        bool success = await machineApiMigrator!.MigrateAllProjectsAsync(
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
        Console.WriteLine(@$"{when} MachineApiMigration: {message}");
#if DEBUG
        Debug.WriteLine($"{when} MachineApiMigration: {message}");
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
            .UseStartup<Startup>();
    }
}
