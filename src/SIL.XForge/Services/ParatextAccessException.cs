using System;
using System.Security;

public enum ParatextAccessRejectionReason
{
    InvalidAuthorizationToken,
    InvalidOrRevokedRefreshToken,
    UnknownReason
}

public class ParatextAccessException : SecurityException
{
    public ParatextAccessRejectionReason Reason;
    public ParatextAccessException(Exception inner, ParatextAccessRejectionReason reason) : base(BuildMessage(reason), inner)
    {
        Reason = reason;
    }

    private static string BuildMessage(ParatextAccessRejectionReason reason)
    {
        return $"Error accessing Paratext: {reason.ToString()}";
    }
}
