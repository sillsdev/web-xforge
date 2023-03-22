using System.Globalization;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture;

namespace WhitespaceRestoreMigration;

/// <summary>
/// Configurations and services needed to bootstrap the migration app.
/// This was copied and modified from `SIL.XForge.Scripture/Startup.cs`.
/// </summary>
public class Startup
{
    public Startup(IConfiguration configuration, IWebHostEnvironment env, ILoggerFactory loggerFactory)
    {
        Configuration = configuration;
        // Random, big number.
        int migratorRealtimeServerPort = 39571;
        // Use a different port than the default realtime server port, to not conflict if SF is
        // running. And specific, rather than just available or random, to make sure we really
        // won't be handling user requests.
        Configuration["Realtime:Port"] = $"{migratorRealtimeServerPort}";
        Configuration["Realtime:DocumentCacheDisabled"] = "true";
        Environment = env;
        LoggerFactory = loggerFactory;
    }

    public IConfiguration Configuration { get; }

    public IWebHostEnvironment Environment { get; }

    public ILoggerFactory LoggerFactory { get; }

    public IContainer? ApplicationContainer { get; private set; }

    /// <summary>
    /// Configures the services.
    /// </summary>
    /// <param name="services">The services.</param>
    /// <returns>The service provider.</returns>
    public IServiceProvider ConfigureServices(IServiceCollection services)
    {
        var containerBuilder = new ContainerBuilder();

        services.AddExceptionReporting(Configuration);
        services.AddConfiguration(Configuration);
        services.AddSFRealtimeServer(
            LoggerFactory,
            Configuration,
            nodeOptions: null,
            Program.RealtimeServerMigrationsDisabled
        );
        services.AddSFServices();
        services.AddSFDataAccess(Configuration);
        services.Configure<RequestLocalizationOptions>(opts =>
        {
            var supportedCultures = new List<CultureInfo>();
            foreach (var culture in SharedResource.Cultures)
            {
                supportedCultures.Add(new CultureInfo(culture.Key));
            }

            opts.DefaultRequestCulture = new RequestCulture("en");
            // Formatting numbers, dates, etc.
            opts.SupportedCultures = supportedCultures;
            // UI strings that we localized.
            opts.SupportedUICultures = supportedCultures;
        });
        services.AddLocalization(options => options.ResourcesPath = "Resources");
        services.AddSFMachine(Configuration, Environment);

        services.AddSingleton<Migrator>();

        containerBuilder.Populate(services);
        ApplicationContainer = containerBuilder.Build();
        return new AutofacServiceProvider(ApplicationContainer);
    }

    /// <summary>
    /// Configures the specified application.
    /// </summary>
    /// <param name="app">The application.</param>
    /// <param name="appLifetime">The application lifetime.</param>
    public void Configure(IApplicationBuilder app, IHostApplicationLifetime appLifetime)
    {
        Program.Log(@"Configuring app");
        // Set a custom realtime port using the Realtime__Port environment variable
        string realtimePort = Configuration["Realtime:Port"];
        Program.Log(@$"Realtime:Port : {realtimePort}");
        app.UseRealtimeServer();
        app.UseSFDataAccess();
        app.UseSFServices();
        app.UseMachine();
        appLifetime.ApplicationStopped.Register(() => ApplicationContainer?.Dispose());
    }
}
