using System;
using System.Net.Http;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using JsonApiDotNetCore.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.Configuration;

namespace SIL.XForge.Transcriber
{
    public class Startup
    {
        public Startup(IConfiguration configuration, IHostingEnvironment env)
        {
            Configuration = configuration;
            Environment = env;
        }

        public IConfiguration Configuration { get; }
        public IHostingEnvironment Environment { get; }
        public IContainer ApplicationContainer { get; private set; }

        private bool IsDevelopment => Environment.IsDevelopment() || Environment.IsEnvironment("Testing");

        // This method gets called by the runtime. Use this method to add services to the container.
        public IServiceProvider ConfigureServices(IServiceCollection services)
        {
            var containerBuilder = new ContainerBuilder();

            services.AddConfiguration(Configuration);

            services.AddRealtimeServer(IsDevelopment);

            services.AddExceptionLogging();

            services.AddCommonServices();

            services.AddXFIdentityServer(Configuration, IsDevelopment);

            var siteOptions = Configuration.GetOptions<SiteOptions>();
            services.AddAuthentication()
                .AddJwtBearer(options =>
                {
                    if (IsDevelopment)
                    {
                        options.RequireHttpsMetadata = false;
                        options.BackchannelHttpHandler = new HttpClientHandler
                        {
                            ServerCertificateCustomValidationCallback
                                = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
                        };
                    }
                    options.Authority = siteOptions.Origin.ToString();
                    options.Audience = "api";
                });

            services.AddTranscriberDataAccess(Configuration);

            IMvcBuilder mvcBuilder = services.AddMvc()
                .SetCompatibilityVersion(CompatibilityVersion.Version_2_1);

            services.AddTranscriberJsonApi(mvcBuilder, containerBuilder, Configuration);

            services.AddXFJsonRpc();

            // In production, the Angular files will be served from this directory
            services.AddSpaStaticFiles(configuration =>
            {
                configuration.RootPath = "ClientApp/dist";
            });

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

            app.UseStaticFiles();
            app.UseSpaStaticFiles();

            app.UseXFIdentityServer();

            app.UseJsonApi();

            app.UseXFJsonRpc();

            app.UseMvc(routes =>
            {
                routes.MapRoute(name: "default", template: "{controller}/{action=Index}/{id?}");
            });

            app.UseSpa(spa =>
            {
                // To learn more about options for serving an Angular SPA from ASP.NET Core,
                // see https://go.microsoft.com/fwlink/?linkid=864501

                spa.Options.SourcePath = "ClientApp";

                if (IsDevelopment)
                {
                    spa.UseAngularCliServer(npmScript: "start");
                }
            });

            app.UseRealtimeServer();

            app.UseTranscriberDataAccess();

            appLifetime.ApplicationStopped.Register(() => ApplicationContainer.Dispose());
        }
    }
}
