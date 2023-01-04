using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IAudioService
{
    Task ConvertToMp3Async(string inputPath, string outputPath);
}
