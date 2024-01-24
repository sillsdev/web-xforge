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
            Program.RealtimeServerMigrationsDisabled,
            useExistingRealtimeServer: true
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
        app.UseSFDataAccess();
        app.UseSFServices();
        app.UseMachine();
        appLifetime.ApplicationStopped.Register(() => ApplicationContainer?.Dispose());
    }
}
