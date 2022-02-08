using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
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
        private static readonly HashSet<string> DevelopmentSpaGetRoutes = new HashSet<string>
        {
            "runtime.js", "runtime.js.map",
            "polyfills.js", "polyfills.js.map",
            "styles.css", "styles.css.map",
            "styles.js", "styles.js.map",
            "vendor.js", "vendor.js.map",
            "main.js", "main.js.map",
            "manifest.json",
            "sockjs-node"
        };
        // examples of filenames are "main-es5.4e5295b95e4b6c37b696.js", "styles.a2f070be0b37085d72ba.css"
        private static readonly HashSet<string> ProductionSpaGetRoutes = new HashSet<string>
        {
            "polyfills-es2015",
            "polyfills-es5",
            "runtime-es2015",
            "runtime-es5",
            "main-es2015",
            "main-es5",
            "styles"
        };
        private static readonly HashSet<string> SpaGetRoutes = new HashSet<string>
        {
            "connect-project",
            "login",
            "projects",
            "system-administration",
            "favicon.ico",
            "assets"
        };

        private static readonly HashSet<string> DevelopmentSpaPostRoutes = new HashSet<string>
        {
            "sockjs-node"
        };
        private static readonly HashSet<string> ProductionSpaPostRoutes = new HashSet<string>();
        private static readonly HashSet<string> SpaPostRoutes = new HashSet<string>();

        public Startup(IConfiguration configuration, IWebHostEnvironment env, ILoggerFactory loggerFactory)
        {
            Configuration = configuration;
            Environment = env;
            LoggerFactory = loggerFactory;
            if (IsDevelopmentEnvironment || IsTestingEnvironment)
            {
                SpaGetRoutes.UnionWith(DevelopmentSpaGetRoutes);
                SpaPostRoutes.UnionWith(DevelopmentSpaPostRoutes);
            }
            else
            {
                SpaGetRoutes.UnionWith(ProductionSpaGetRoutes);
                SpaPostRoutes.UnionWith(ProductionSpaPostRoutes);
            }
        }

        public IConfiguration Configuration { get; }
        public IWebHostEnvironment Environment { get; }
        public ILoggerFactory LoggerFactory { get; }
        public IContainer ApplicationContainer { get; private set; }

        private SpaDevServerStartup SpaDevServerStartup
        {
            get
            {
                if (IsDevelopmentEnvironment)
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
                else if (IsTestingEnvironment)
                {
                    return SpaDevServerStartup.Listen;
                }
                return SpaDevServerStartup.None;
            }
        }

        private bool IsDevelopmentEnvironment => Environment.IsDevelopment();
        private bool IsTestingEnvironment => Environment.IsEnvironment("Testing");

        // This method gets called by the runtime. Use this method to add services to the container.
        public IServiceProvider ConfigureServices(IServiceCollection services)
        {
            var containerBuilder = new ContainerBuilder();

            services.AddExceptionReporting(Configuration);

            services.AddConfiguration(Configuration);

            services.AddSFRealtimeServer(LoggerFactory, Configuration, IsDevelopmentEnvironment || IsTestingEnvironment);

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
                // TODO: check if JSON.NET is required
                .AddNewtonsoftJson()
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
        public void Configure(IApplicationBuilder app, IHostApplicationLifetime appLifetime,
            IExceptionHandler exceptionHandler)
        {
            if (IsDevelopmentEnvironment || IsTestingEnvironment)
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler(errorApp => exceptionHandler.ReportExceptions(errorApp));
            }

            app.UseStatusCodePagesWithReExecute("/Status/Error", "?code={0}");

            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.All
            });

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

            app.UseRouting();

            app.UseAuthentication();
            app.UseAuthorization();

            app.UseRealtimeServer();

            app.UseMachine();

            app.UseSFServices();

            app.UseSFDataAccess();

            app.UsePing();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
                endpoints.MapRazorPages();
            });

            // Map JSON-RPC controllers after MVC controllers, so that MVC controllers take precedence.
            app.UseSFJsonRpc();

            app.MapWhen(IsSpaRoute, spaApp =>
            {
                // setup all server-side routes before SPA client-side routes, so that the server-side routes supercede
                // the client-side routes
                spaApp.UseSpa(spa =>
                {
                    // To learn more about options for serving an Angular SPA from ASP.NET Core,
                    // see https://go.microsoft.com/fwlink/?linkid=864501
                    spa.Options.SourcePath = "ClientApp";

                    switch (SpaDevServerStartup)
                    {
                        case SpaDevServerStartup.Start:
                            string npmScript = "start";
                            Console.WriteLine($"Info: SF is serving angular using script {npmScript}.");
                            spa.UseAngularCliServer(npmScript);
                            break;

                        case SpaDevServerStartup.Listen:
                            int port = 4200;
                            string ngServeUri = $"http://localhost:{port}";
                            Console.WriteLine($"Info: SF will use an existing angular server at {ngServeUri}.");
                            spa.UseProxyToSpaDevelopmentServer(ngServeUri);
                            break;
                    }
                });
            });

            appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
        }

        internal bool IsSpaRoute(HttpContext context)
        {
            string path = context.Request.Path.Value;
            if (path.Length <= 1)
                return false;
            int index = path.IndexOf("/", 1);
            if (index == -1)
                index = path.Length;
            string prefix = path.Substring(1, index - 1);
            if (!IsDevelopmentEnvironment && !IsTestingEnvironment && (prefix.EndsWith(".js") ||
                prefix.EndsWith(".js.map") || prefix.EndsWith(".css") || prefix.EndsWith(".css.map")))
            {
                int periodIndex = path.IndexOf(".");
                prefix = prefix.Substring(0, periodIndex - 1);
            }
            return (context.Request.Method == HttpMethods.Get && SpaGetRoutes.Contains(prefix)) ||
                (context.Request.Method == HttpMethods.Post && SpaPostRoutes.Contains(prefix));
        }
    }
}
