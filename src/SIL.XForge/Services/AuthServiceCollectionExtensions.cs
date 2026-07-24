using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Duende.IdentityModel;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using SIL.XForge;
using SIL.XForge.Configuration;

namespace Microsoft.Extensions.DependencyInjection;

public static class AuthServiceCollectionExtensions
{
    public static IServiceCollection AddXFAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var authOptions = configuration.GetOptions<AuthOptions>();
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = authOptions.Authority;
                // Allow http:// authorities (local mock auth server)
                options.RequireHttpsMetadata = authOptions.Authority.StartsWith("https://");
                options.Audience = authOptions.Audience;
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        // If the request is for our SignalR hub
                        string? accessToken = context.Request.Query["access_token"];
                        if (
                            !string.IsNullOrEmpty(accessToken)
                            && (
                                context.HttpContext.Request.Path.StartsWithSegments(
                                    $"/{UrlConstants.ProjectNotifications}"
                                )
                                || context.HttpContext.Request.Path.StartsWithSegments(
                                    $"/{UrlConstants.DraftNotifications}"
                                )
                            )
                        )
                        {
                            // Get the token from the query string
                            context.Token = accessToken;
                        }

                        return Task.CompletedTask;
                    },
                    OnTokenValidated = context =>
                    {
                        string? scopeClaim = context.Principal?.FindFirst(c => c.Type == JwtClaimTypes.Scope)?.Value;
                        var scopes = new HashSet<string>(scopeClaim?.Split(' ') ?? Enumerable.Empty<string>());
                        if (!scopes.Contains(authOptions.Scope))
                            context.Fail("A required scope has not been granted.");
                        return Task.CompletedTask;
                    },
                };
            });
        return services;
    }
}
