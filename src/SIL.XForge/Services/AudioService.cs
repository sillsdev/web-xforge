using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

public class AudioService : IAudioService
{
    private readonly IOptions<AudioOptions> _audioOptions;

    public AudioService(IOptions<AudioOptions> audioOptions) => _audioOptions = audioOptions;

    public async Task ConvertToMp3Async(string inputPath, string outputPath)
    {
        using var process = new Process()
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = _audioOptions.Value.FfmpegPath,
                Arguments = $"-y -i \"{inputPath}\" \"{outputPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        process.Start();
        await WaitForExitAsync(process);
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Error: Could not convert {inputPath} to mp3");
    }

    private static Task WaitForExitAsync(Process process)
    {
        var tcs = new TaskCompletionSource<object>();
        process.EnableRaisingEvents = true;
        process.Exited += (sender, args) => tcs.TrySetResult(null);
        return tcs.Task;
    }
}
