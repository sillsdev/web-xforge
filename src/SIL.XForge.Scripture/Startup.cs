using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture
{
    public enum SpaDevServerStartup
    {
        None,
        Start,
        Listen
    }

    public class Startup
    {
        public Startup(IConfiguration configuration, IHostingEnvironment env, ILoggerFactory loggerFactory)
        {
            Configuration = configuration;
            Environment = env;
            LoggerFactory = loggerFactory;
        }

        public IConfiguration Configuration { get; }
        public IHostingEnvironment Environment { get; }
        public ILoggerFactory LoggerFactory { get; }
        public IContainer ApplicationContainer { get; private set; }

        private SpaDevServerStartup SpaDevServerStartup
        {
            get
            {
                if (Environment.IsDevelopment())
                {
                    string startNgServe = Configuration.GetValue("start-ng-serve", "yes");
                    switch (startNgServe)
                    {
                        case "yes":
                            return SpaDevServerStartup.Start;
                        case "listen":
                            return SpaDevServerStartup.Listen;
                    }
                }
                else if (Environment.IsEnvironment("Testing"))
                {
                    return SpaDevServerStartup.Listen;
                }
                return SpaDevServerStartup.None;
            }
        }

        private bool IsDevelopment => Environment.IsDevelopment() || Environment.IsEnvironment("Testing");

        // This method gets called by the runtime. Use this method to add services to the container.
        public IServiceProvider ConfigureServices(IServiceCollection services)
        {
            var containerBuilder = new ContainerBuilder();

            services.AddConfiguration(Configuration);

            services.AddSFRealtimeServer(LoggerFactory, Configuration, IsDevelopment);

            services.AddExceptionLogging();

            services.AddSFServices();

            services.AddXFAuthentication(Configuration);

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

            services.AddLocalization(options => options.ResourcesPath = "Resources");

            services.AddMvc()
                .SetCompatibilityVersion(CompatibilityVersion.Version_2_1)
                .AddViewLocalization()
                .AddDataAnnotationsLocalization(options =>
                {
                    options.DataAnnotationLocalizerProvider = (type, factory) =>
                        factory.Create(typeof(SharedResource));
                });

            services.AddXFJsonRpc();

            if (SpaDevServerStartup == SpaDevServerStartup.None)
            {
                // In production, the Angular files will be served from this directory
                services.AddSpaStaticFiles(configuration =>
                {
                    configuration.RootPath = "ClientApp/dist";
                });
            }

            services.AddSFMachine(Configuration);

            containerBuilder.Populate(services);

            ApplicationContainer = containerBuilder.Build();
            return new AutofacServiceProvider(ApplicationContainer);
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IApplicationLifetime appLifetime)
        {
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.All
            });

            if (IsDevelopment)
                app.UseDeveloperExceptionPage();

            app.UseExceptionLogging();

            app.UseRequestLocalization(app.ApplicationServices.GetService<IOptions<RequestLocalizationOptions>>().Value);

            app.UseStaticFiles(new StaticFileOptions
            {
                // this will allow files without extensions to be served, which is necessary for LetsEncrypt
                ServeUnknownFileTypes = true,
                OnPrepareResponse = ctx =>
                {
                    ctx.Context.Response.Headers.Add("Cache-Control", "must-revalidate");
                }
            });
            IOptions<SiteOptions> siteOptions = app.ApplicationServices.GetService<IOptions<SiteOptions>>();
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(Path.Combine(siteOptions.Value.SiteDir, "audio")),
                RequestPath = "/assets/audio"
            });

            if (SpaDevServerStartup == SpaDevServerStartup.None)
                app.UseSpaStaticFiles();

            app.UseAuthentication();

            app.UseSFJsonRpc();

            app.UseMvc(routes =>
            {
                routes.MapRoute(name: "default", template: "{controller}/{action=Index}/{id?}");
            });

            app.UseRealtimeServer();

            app.UseMachine();

            app.UseSFDataAccess();

            // setup all server-side routes before SPA client-side routes, so that the server-side routes supercede the
            // client-side routes
            app.UseSpa(spa =>
            {
                // To learn more about options for serving an Angular SPA from ASP.NET Core,
                // see https://go.microsoft.com/fwlink/?linkid=864501
                spa.Options.SourcePath = "ClientApp";

                switch (SpaDevServerStartup)
                {
                    case SpaDevServerStartup.Start:
                        spa.UseAngularCliServer(npmScript: "start:no-progress");
                        break;

                    case SpaDevServerStartup.Listen:
                        spa.UseProxyToSpaDevelopmentServer("http://localhost:4200");
                        break;
                }
            });

            appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
        }
    }
}
