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
using Microsoft.FeatureManagement;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture;

namespace MachineApiMigration;

/// <summary>
/// Configurations and services needed to bootstrap the Machine API Migration app.
/// This was copied and modified from `SIL.XForge.Scripture/Startup.cs`.
/// </summary>
public class Startup
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Startup"/> class.
    /// </summary>
    /// <param name="configuration">The configuration.</param>
    /// <param name="env">The env.</param>
    /// <param name="loggerFactory">The logger factory.</param>
    public Startup(IConfiguration configuration, IWebHostEnvironment env, ILoggerFactory loggerFactory)
    {
        Configuration = configuration;
        Environment = env;
        LoggerFactory = loggerFactory;
    }

    /// <summary>
    /// Gets the configuration.
    /// </summary>
    /// <value>
    /// The configuration.
    /// </value>
    public IConfiguration Configuration { get; }

    /// <summary>
    /// Gets the environment.
    /// </summary>
    /// <value>
    /// The environment.
    /// </value>
    public IWebHostEnvironment Environment { get; }

    /// <summary>
    /// Gets the logger factory.
    /// </summary>
    /// <value>
    /// The logger factory.
    /// </value>
    public ILoggerFactory LoggerFactory { get; }

    /// <summary>
    /// Gets the application container.
    /// </summary>
    /// <value>
    /// The application container.
    /// </value>
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
        services.AddFeatureManagement(Configuration).AddSessionManager<MigratorFeatureSessionManager>();
        services.AddSFRealtimeServer(LoggerFactory, Configuration, nodeOptions: null, Program.MigrationsDisabled);
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

        services.AddSingleton<MachineApiMigrator>();

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
