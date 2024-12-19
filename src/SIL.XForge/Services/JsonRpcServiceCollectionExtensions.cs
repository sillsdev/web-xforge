using System.Text.Json;
using System.Text.Json.Serialization;
using EdjCase.JsonRpc.Common;
using EdjCase.JsonRpc.Router;
using Microsoft.AspNetCore.Builder;
using SIL.XForge;
using SIL.XForge.DataAccess;

namespace Microsoft.Extensions.DependencyInjection;

public static class JsonRpcServiceCollectionExtensions
{
    /// <summary>
    /// Initializes the static instance of <see cref="JsonRpcServiceCollectionExtensions"/>.
    /// </summary>
    static JsonRpcServiceCollectionExtensions() => JsonSerializerOptions.Converters.Add(new BsonValueConverter());

    /// <summary>
    /// The Json serializer options for EdjCase.JsonRpc
    /// </summary>
    /// <remarks>
    /// This is internal so unit tests can use it.
    /// </remarks>
    internal static JsonSerializerOptions JsonSerializerOptions { get; } =
        new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

    public static IServiceCollection AddXFJsonRpc(this IServiceCollection services)
    {
        services.AddJsonRpc(config =>
        {
            config.JsonSerializerSettings = JsonSerializerOptions;
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
