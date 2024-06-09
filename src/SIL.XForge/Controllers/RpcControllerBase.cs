using EdjCase.JsonRpc.Common;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.AspNetCore.Authorization;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

/// <summary>
/// This is the base class for all JSON-RPC controllers.
/// </summary>
[Authorize]
public abstract class RpcControllerBase : RpcController
{
    public const int ForbiddenErrorCode = -32000;
    public const int NotFoundErrorCode = -32001;

    private readonly IExceptionHandler _exceptionHandler;
    private readonly IUserAccessor _userAccessor;

    protected RpcControllerBase(IUserAccessor userAccessor, IExceptionHandler exceptionHandler)
    {
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    protected string UserId => _userAccessor.UserId;
    protected string[] SystemRoles => _userAccessor.SystemRoles;
    protected string AuthId => _userAccessor.AuthId;

    protected IRpcMethodResult InvalidParamsError(string message) => Error((int)RpcErrorCode.InvalidParams, message);

    protected IRpcMethodResult ForbiddenError() =>
        Error(ForbiddenErrorCode, "The user does not have permission to perform this operation.");

    protected IRpcMethodResult NotFoundError(string message) => Error(NotFoundErrorCode, message);
}
