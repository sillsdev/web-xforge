using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using IdentityModel;
using idunno.Authentication.Basic;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class AuthServiceCollectionExtensions
    {
        public static IServiceCollection AddXFAuthentication(
            this IServiceCollection services,
            IConfiguration configuration
        )
        {
            var authOptions = configuration.GetOptions<AuthOptions>();
            services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.Authority = $"https://{authOptions.Domain}/";
                    options.Audience = authOptions.Audience;
                    options.Events = new JwtBearerEvents
                    {
                        OnTokenValidated = context =>
                        {
                            string scopeClaim = context.Principal.FindFirst(c => c.Type == JwtClaimTypes.Scope)?.Value;
                            var scopes = new HashSet<string>(scopeClaim?.Split(' ') ?? Enumerable.Empty<string>());
                            if (!scopes.Contains(authOptions.Scope))
                                context.Fail("A required scope has not been granted.");
                            return Task.CompletedTask;
                        }
                    };
                })
                .AddBasic(options =>
                {
                    options.Events = new BasicAuthenticationEvents
                    {
                        OnValidateCredentials = context =>
                        {
                            var authService = context.HttpContext.RequestServices.GetService<IAuthService>();
                            if (authService.ValidateWebhookCredentials(context.Username, context.Password))
                            {
                                Claim[] claims = new[]
                                {
                                    new Claim(
                                        ClaimTypes.NameIdentifier,
                                        context.Username,
                                        ClaimValueTypes.String,
                                        context.Options.ClaimsIssuer
                                    ),
                                    new Claim(
                                        ClaimTypes.Name,
                                        context.Username,
                                        ClaimValueTypes.String,
                                        context.Options.ClaimsIssuer
                                    )
                                };

                                context.Principal = new ClaimsPrincipal(
                                    new ClaimsIdentity(claims, context.Scheme.Name)
                                );
                                context.Success();
                            }
                            return Task.CompletedTask;
                        }
                    };
                });
            return services;
        }
    }
}
