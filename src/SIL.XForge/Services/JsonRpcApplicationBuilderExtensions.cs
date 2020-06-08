using System;
using System.Security.Claims;
using EdjCase.JsonRpc.Router;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using SIL.XForge;
using SIL.XForge.Controllers;

namespace Microsoft.AspNetCore.Builder
{
    public static class JsonRpcApplicationBuilderExtensions
    {
        public static void UseXFJsonRpc(this IApplicationBuilder app, Action<RpcEndpointBuilder> configureOptions)
        {
            app.Map($"/{UrlConstants.CommandApiNamespace}", b =>
            {
                // add a custom middleware that authenticates all schemes.
                // Workaround for the lack of support of multiple authentication schemes in EdjCase.JsonRpc.
                b.Use(async (context, next) =>
                {
                    var authSchemeProvider = context.RequestServices.GetService<IAuthenticationSchemeProvider>();
                    ClaimsPrincipal principal = null;
                    foreach (AuthenticationScheme scheme in await authSchemeProvider.GetAllSchemesAsync())
                    {
                        AuthenticateResult result = await context.AuthenticateAsync(scheme.Name);
                        if (result.Succeeded)
                        {
                            if (principal == null)
                                principal = result.Principal;
                            else
                                principal.AddIdentities(result.Principal.Identities);
                        }
                    }
                    if (principal != null)
                        context.User = principal;
                    await next();
                });

                b.UseJsonRpc(options =>
                {
                    options.AddControllerWithCustomPath<UsersRpcController>(UrlConstants.Users);
                    configureOptions(options);
                });
            });
        }
    }
}
