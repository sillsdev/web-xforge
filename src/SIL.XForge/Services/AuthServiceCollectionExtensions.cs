using System.Security.Claims;
using System.Threading.Tasks;
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
        public static IServiceCollection AddXFAuthentication(this IServiceCollection services,
            IConfiguration configuration, string audience)
        {
            var authOptions = configuration.GetOptions<AuthOptions>();
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.Authority = $"https://{authOptions.Domain}/";
                    options.Audience = audience;
                })
                .AddBasic(options =>
                {
                    options.Events = new BasicAuthenticationEvents
                    {
                        OnValidateCredentials = context =>
                        {
                            var authService = context.HttpContext.RequestServices.GetService<AuthService>();
                            if (authService.ValidatePushCredentials(context.Username, context.Password))
                            {
                                Claim[] claims = new[]
                                {
                                    new Claim(ClaimTypes.NameIdentifier, context.Username, ClaimValueTypes.String,
                                        context.Options.ClaimsIssuer),
                                    new Claim(ClaimTypes.Name, context.Username, ClaimValueTypes.String,
                                        context.Options.ClaimsIssuer)
                                };

                                context.Principal = new ClaimsPrincipal(new ClaimsIdentity(claims,
                                    context.Scheme.Name));
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
