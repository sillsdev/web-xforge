using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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
    private static readonly HashSet<string> DevelopmentSpaGetRoutes =
    [
        // "runtime.js",
        // "runtime.js.map",

        // "vendor.js",
        // "vendor.js.map",

        "@vite",
        "@fs",
        "sockjs-node",
        "3rdpartylicenses.txt",
    ];

    // ?   examples of filenames are "main-es5.4e5295b95e4b6c37b696.js", "styles.a2f070be0b37085d72ba.css"
    private static readonly HashSet<string> ProductionSpaGetRoutes = [];
    private static readonly HashSet<string> SpaGetRoutes =
    [
        "manifest.json",
        "callback",
        "connect-project",
        "login",
        "projects",
        "join",
        "serval-administration",
        "system-administration",
        "favicon.ico",
        "assets",
        "polyfills",
        "main",
        "chunk",
        "styles",
        "worker",
        "en",
        "quill",
    ];

    private static readonly HashSet<string> DevelopmentSpaPostRoutes = ["sockjs-node"];
    private static readonly HashSet<string> ProductionSpaPostRoutes = [];
    private static readonly HashSet<string> SpaPostRoutes = [];
    private const string SpaGetRoutesLynxPrefix = "node_modules_sillsdev_lynx";
    private const string SpaGetRoutesWorkerPrefix = "worker-";

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

        string? nodeOptions = Configuration.GetValue<string>("node-options");
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
                new DashboardOptions { Authorization = [new HangfireDashboardAuthorizationFilter(authOptions)] }
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

    internal bool IsSpaRoute(HttpContext context)
    {
        Console.WriteLine($"Startup.cs IsSpaRoute: Checking if SPA route: '{context.Request.Path}'");
        string path = context.Request.Path.Value;
        if (path.Length <= 1)
        {
            Console.WriteLine($"Startup.cs IsSpaRoute: Not an SPA route because path length <= 1: '{path}'");
            return false;
        }
        int index = path.IndexOf("/", 1);
        if (index == -1)
            index = path.Length;
        string prefix = path[1..index];
        if (
            (
                prefix.EndsWith(".js")
                || prefix.EndsWith(".js.map")
                || prefix.EndsWith(".css")
                || prefix.EndsWith(".css.map")
            )
        )
        {
            int hashDelimiterIndex = path.IndexOf("-");
            if (hashDelimiterIndex >= 0)
            {
                prefix = prefix[..(hashDelimiterIndex - 1)];
            }
        }

        bool isLazyChunkRoute =
            context.Request.Method == HttpMethods.Get
            && (prefix.StartsWith(SpaGetRoutesLynxPrefix) || prefix.StartsWith(SpaGetRoutesWorkerPrefix));

        if (isLazyChunkRoute)
        {
            Console.WriteLine($"Startup.cs IsSpaRoute: Detected lazy chunk route: '{path}'");
            return true;
        }

        bool result =
            (context.Request.Method == HttpMethods.Get && SpaGetRoutes.Contains(prefix))
            || (context.Request.Method == HttpMethods.Post && SpaPostRoutes.Contains(prefix));
        Console.WriteLine($"Startup.cs IsSpaRoute: Detected SPA route: {result}: '{path}'");
        return result;
    }
}
