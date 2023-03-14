namespace SIL.XForge.Services;

public interface ISecurityService
{
    string GenerateKey(int bytes = 12);
}
