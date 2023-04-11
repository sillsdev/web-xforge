namespace SIL.XForge.Services;

public interface ISecurityService
{
    string GenerateKey(int length = 12);
}
