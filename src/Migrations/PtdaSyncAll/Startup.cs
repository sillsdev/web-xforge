using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using SIL.XForge;
using SIL.XForge.Configuration;
using SIL.XForge.Scripture;
using SIL.XForge.Scripture.Services;

namespace PtdaSyncAll
{
    /// <summary>
    /// PtdaSyncAll app configuration to get needed services available.
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

            services.AddLocalization(options => options.ResourcesPath = "Resources");

            services.AddSFMachine(Configuration);
            services.AddTransient<ParatextSyncRunner>();

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
            // Set a custom realtime port using the Realtime__Port environment variable
            string realtimePort = Configuration["Realtime:Port"];
            Console.WriteLine($"Realtime:Port : {realtimePort}");
            app.UseRealtimeServer();
            app.UseSFDataAccess();
            appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
        }
    }
}
