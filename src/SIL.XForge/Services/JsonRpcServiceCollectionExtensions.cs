using System.Text.Json;
using System.Text.Json.Serialization;
using EdjCase.JsonRpc.Common;
using EdjCase.JsonRpc.Router;
using Microsoft.AspNetCore.Builder;
using SIL.XForge;

namespace Microsoft.Extensions.DependencyInjection;

public static class JsonRpcServiceCollectionExtensions
{
    public static IServiceCollection AddXFJsonRpc(this IServiceCollection services)
    {
        services.AddJsonRpc(config =>
        {
            config.JsonSerializerSettings = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            };

            config.OnInvokeException = context =>
            {
                var exceptionHandler = context.ServiceProvider.GetService<IExceptionHandler>();
                exceptionHandler.ReportException(context.Exception);
                var rpcException = new RpcException(
                    (int)RpcErrorCode.InternalError,
                    "Exception occurred from target method execution.",
                    context.Exception
                );
                return OnExceptionResult.UseExceptionResponse(rpcException);
            };
        });
        return services;
    }
}
