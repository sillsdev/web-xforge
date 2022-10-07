using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineCorporaService
    {
        Task<string> AddCorporaAsync(string name);
    }
}
