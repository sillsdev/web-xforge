using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Hangfire;
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
using Microsoft.FeatureManagement;
using SIL.XForge.Configuration;
using SIL.XForge.EventMetrics;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture;

public enum SpaDevServerStartup
{
    None,
    Start,
    Listen,
}

public class Startup
{
    /// <summary>
    /// Routes that should be handled by SPA in development but not in production.
    /// </summary>
    private static readonly HashSet<string> DevelopmentSpaGetRoutes =
    [
        "@vite",
        "@fs",
        "3rdpartylicenses.txt",
        // sockjs-node is related to communication during `ng serve`
        "sockjs-node",
    ];

    /// <summary>
    /// Routes that should be handled by SPA in production but not in development
    /// </summary>
    private static readonly HashSet<string> ProductionSpaGetRoutes = [];

    /// <summary>
    /// Routes that should be handled by SPA in both production and development.
    /// </summary>
    private readonly HashSet<string> SpaGetRoutes =
    [
        "index.html",
        "prerendered-routes.json",
        "3rdpartylicenses",
        // PWA files
        "ngsw.json",
        "ngsw-worker.js",
        "offline.html",
        "safety-worker.js",
        "sf-service-worker.js",
        "manifest.json",
        // Application routes
        "callback",
        "connect-project",
        "login",
        "projects",
        "join",
        "serval-administration",
        "system-administration",
        // Asset and build files
        "assets",
        "polyfills",
        "main",
        "chunk",
        "styles",
        "en",
        "quill",
        "ngx-quill",
        // Lynx-related
        "worker",
        "node_modules_sillsdev_lynx",
    ];

    private static readonly HashSet<string> DevelopmentSpaPostRoutes = ["sockjs-node"];
    private static readonly HashSet<string> ProductionSpaPostRoutes = [];
    private readonly HashSet<string> SpaPostRoutes = [];

    public Startup(IConfiguration configuration, IWebHostEnvironment env, ILoggerFactory loggerFactory)
    {
        Configuration = configuration;
        Environment = env;
        LoggerFactory = loggerFactory;
        if (IsDevelopmentEnvironment)
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
    private bool IsStagingEnvironment => Environment.IsEnvironment("Staging");

    // This method gets called by the runtime. Use this method to add services to the container.
    public IServiceProvider ConfigureServices(IServiceCollection services)
    {
        var containerBuilder = new ContainerBuilder();

        services.AddExceptionReporting(Configuration);

        services.AddConfiguration(Configuration);

        services.AddFeatureManagement();

        services.AddSignalR();

        string? nodeOptions = Configuration.GetValue<string>("Realtime:NodeOptions");
        services.AddSFRealtimeServer(LoggerFactory, Configuration, nodeOptions);

        services.AddSFServices();

        services.AddXFAuthentication(Configuration);

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
            // UI strings that we have localized.
            opts.SupportedUICultures = supportedCultures;
        });

        services.AddLocalization(options => options.ResourcesPath = "Resources");

        services
            .AddMvc()
            .AddNewtonsoftJson()
            .AddViewLocalization()
            .AddDataAnnotationsLocalization(options =>
                options.DataAnnotationLocalizerProvider = (type, factory) => factory.Create(typeof(SharedResource))
            );

        services.AddXFJsonRpc();

        services.AddApiDocumentation();

        if (SpaDevServerStartup == SpaDevServerStartup.None)
        {
            // In production, the Angular files will be served from this directory
            services.AddSpaStaticFiles(configuration => configuration.RootPath = "ClientApp/dist/browser");
        }

        services.AddSFMachine(Configuration, Environment);

        // Add the event metrics service
        services.AddEventMetrics();

        // Populate the services in the Autofac container builder
        containerBuilder.Populate(services);

        // Register the event metrics interceptor
        containerBuilder.RegisterSFEventMetrics();

        ApplicationContainer = containerBuilder.Build();
        GlobalConfiguration.Configuration.UseAutofacActivator(ApplicationContainer);
        return new AutofacServiceProvider(ApplicationContainer);
    }

    // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
    public void Configure(
        IApplicationBuilder app,
        IHostApplicationLifetime appLifetime,
        IExceptionHandler exceptionHandler
    )
    {
        if (IsDevelopmentEnvironment || IsTestingEnvironment || IsStagingEnvironment)
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        if (IsDevelopmentEnvironment || IsTestingEnvironment)
        {
            app.UseDeveloperExceptionPage();
        }
        else
        {
            app.UseExceptionHandler(exceptionHandler.ReportExceptions);
        }

        app.UseStatusCodePagesWithReExecute("/Status/Error", "?code={0}");

        app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.All });

        app.UseRequestLocalization(app.ApplicationServices.GetService<IOptions<RequestLocalizationOptions>>().Value);

        app.UseStaticFiles(
            new StaticFileOptions
            {
                // this will allow files without extensions to be served, which is necessary for LetsEncrypt
                ServeUnknownFileTypes = true,
                OnPrepareResponse = ctx => ctx.Context.Response.Headers.Append("Cache-Control", "must-revalidate"),
            }
        );
        IOptions<SiteOptions> siteOptions = app.ApplicationServices.GetService<IOptions<SiteOptions>>();
        app.UseStaticFiles(
            new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(Path.Join(siteOptions.Value.SiteDir, "audio")),
                RequestPath = "/assets/audio",
            }
        );
        app.UseStaticFiles(
            new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(
                    Path.Join(siteOptions.Value.SiteDir, TrainingDataService.DirectoryName)
                ),
                RequestPath = $"/assets/{TrainingDataService.DirectoryName}",
            }
        );

        if (SpaDevServerStartup == SpaDevServerStartup.None)
            app.UseSpaStaticFiles();

        app.UseRouting();

        app.UseAuthentication();
        app.UseAuthorization();

        app.UseRealtimeServer();

        app.UseSFServices();

        app.UseSFDataAccess();

        app.UsePing();

        app.UseEndpoints(endpoints =>
        {
            endpoints.MapControllers();
            endpoints.MapRazorPages();
            endpoints.MapHub<NotificationHub>(pattern: $"/{UrlConstants.ProjectNotifications}");
            var authOptions = Configuration.GetOptions<AuthOptions>();
            endpoints.MapHangfireDashboard(
                new DashboardOptions
                {
                    Authorization = [new HangfireDashboardAuthorizationFilter(authOptions)],
                    IgnoreAntiforgeryToken = true,
                }
            );
        });

        // Map JSON-RPC controllers after MVC controllers, so that MVC controllers take precedence.
        app.UseSFJsonRpc();

        app.MapWhen(
            IsSpaRoute,
            spaApp =>
            {
                // setup all server-side routes before SPA client-side routes, so that the server-side routes supercede
                // the client-side routes
                spaApp.UseSpa(spa =>
                {
                    // To learn more about options for serving an Angular SPA from ASP.NET Core,
                    // see https://go.microsoft.com/fwlink/?linkid=864501
                    spa.Options.SourcePath = "ClientApp";

                    int port = 4200;
                    switch (SpaDevServerStartup)
                    {
                        case SpaDevServerStartup.Start:
                            spa.Options.DevServerPort = port;
                            string npmScript = "start";
                            Console.WriteLine($"Info: SF is serving angular using script {npmScript}.");
                            spa.UseAngularCliServer(npmScript);
                            // Note that dotnet will need to see and parse a line like
                            // "open your browser on http://localhost:4200/ "
                            // (https://stackoverflow.com/q/60189930).
                            break;

                        case SpaDevServerStartup.Listen:
                            string ngServeUri = $"http://localhost:{port}";
                            Console.WriteLine($"Info: SF will use an existing angular server at {ngServeUri}.");
                            spa.UseProxyToSpaDevelopmentServer(ngServeUri);
                            break;
                    }
                });
            }
        );

        appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
    }

    /// <summary>Is the request something that should be handled by the Angular SPA, instead of by ASP.NET?</summary>
    /// <remarks>
    /// A production environment will serve ASP.NET files in wwwroot and SPA files in dist/browser. A development
    /// environment will serve ASP.NET files in wwwroot, and potentially SPA files from dist or in-memory files from `ng
    /// serve`. Note that `ng serve` will generate different looking files depending on whether caching+prebundling is
    /// used or not. When testing this method, it is helpful to run curl against port 5000 vs 4200. This method is
    /// written with the assumption that undefined behaviour for malformed routes is not a concern for security or
    /// functionality.
    /// </remarks>
    internal bool IsSpaRoute(HttpContext context)
    {
        string path = context.Request.Path.Value;
        HashSet<string> spaRoutes =
            context.Request.Method == HttpMethods.Get ? SpaGetRoutes
            : context.Request.Method == HttpMethods.Post ? SpaPostRoutes
            : [];

        // SPA-handled paths will have forms like
        //   /some-route/my-page?a=b
        //   /polyfills-C3D4E5F6.js.map
        //   /safety-worker.js
        //   /@vite/client
        // Anything could conceivably contain a '?'.

        // Look at what is after starting slashes, and before the next slash or '?'. Match paths like /projects/123456789
        // as "projects", /login?a=b as "login", and /safety-worker.js as "safety-worker.js".
        string exact = path?.TrimStart('/').Split('/', '?').FirstOrDefault() ?? string.Empty;
        if (spaRoutes.Contains(exact))
            return true;

        // Then look at what is before the first dash or dot. Match paths like /polyfills-C3D4E5F6.js.map and
        // /polyfills.js as "polyfills".
        string beginning = exact.Split('-', '.').FirstOrDefault();
        if (spaRoutes.Contains(beginning))
            return true;

        // Check if path starts with route token.  Match paths like '/ngx-quill-quill-SOME_HASH.js'
        if (spaRoutes.Any(routeToken => exact.StartsWith(routeToken + "-") || exact.StartsWith(routeToken + ".")))
            return true;

        return false;
    }
}
