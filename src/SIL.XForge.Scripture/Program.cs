#nullable disable warnings
using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace SIL.XForge.Scripture;

public static class Program
{
    public static async Task Main(string[] args)
    {
        // Build the host
        var host = new HostBuilder()
            // Host configuration (command-line args + environment variables)
            .ConfigureHostConfiguration(config =>
            {
                config.SetBasePath(Directory.GetCurrentDirectory());
                config.AddCommandLine(args);
                config.AddEnvironmentVariables();

                // Load hosting.json first, then environment-specific
                var tempConfig = new ConfigurationBuilder()
                    .SetBasePath(Directory.GetCurrentDirectory())
                    .AddJsonFile("hosting.json", optional: true, reloadOnChange: true)
                    .AddJsonFile(
                        $"hosting.{Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT") ?? "Production"}.json",
                        optional: true,
                        reloadOnChange: true
                    )
                    .Build();

                foreach (var kvp in tempConfig.AsEnumerable())
                {
                    config.AddInMemoryCollection(new[] { kvp });
                }
            })
            .ConfigureWebHost(webHostBuilder => webHostBuilder.UseStartup<Startup>())
            .ConfigureAppConfiguration(
                (context, config) =>
                {
                    var env = context.HostingEnvironment;

                    if (env.IsDevelopment() || env.IsEnvironment("Testing"))
                        config.AddJsonFile("appsettings.user.json", optional: true, reloadOnChange: true);
                    else
                        config.AddJsonFile("secrets.json", optional: true, reloadOnChange: true);

                    // Manually read in secrets for development-related environments that aren't specifically "Development".
                    if (env.IsEnvironment("Testing"))
                    {
                        var appAssembly = Assembly.Load(new AssemblyName(env.ApplicationName));
                        config.AddUserSecrets(appAssembly, optional: true);
                    }
                }
            )
            .Build();

        // When an external RealtimeServer process is in use (e.g. in a separate docker container),
        // expect realtimeserver migrations to have already been run (eg by container start.sh).
        var configuration = host.Services.GetRequiredService<IConfiguration>();
        bool useExistingRealtimeServer = configuration.GetValue<bool>("Realtime:UseExistingRealtimeServer");
        if (!useExistingRealtimeServer)
        {
            string environment = host.Services.GetRequiredService<IHostEnvironment>().EnvironmentName;
            Migrator.RunMigrations(environment);
        }

        await host.RunAsync();
    }
}
