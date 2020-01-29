using System;
using EdjCase.JsonRpc.Router.Abstractions;
using EdjCase.JsonRpc.Router.RouteProviders;
using Microsoft.Extensions.Options;
using SIL.XForge;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace Microsoft.AspNetCore.Builder
{
    public static class JsonRpcApplicationBuilderExtensions
    {
        public static void UseXFJsonRpc(this IApplicationBuilder app, Action<RpcManualRoutingOptions> configureOptions)
        {
            var options = new RpcManualRoutingOptions { BaseRequestPath = $"/{UrlConstants.CommandApiNamespace}" };
            options.RegisterController<UsersRpcController>(UrlConstants.Users);
            configureOptions (options);

            app.UseRouter(new MultiAuthSchemeRpcHttpRouter(new RpcManualRouteProvider(Options.Create(options))));
        }
    }
}
