using System;
using System.Diagnostics;
using System.IO;
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

    /// <summary>
    /// Reads the first three bytes of the stream to see if it is MP3 data
    /// </summary>
    /// <param name="stream">The stream.</param>
    /// <returns><c>true</c> if the stream is and MP3 file; otherwise, <c>false</c>.</returns>
    /// <remarks>This code is based on the data in magic.mime.</remarks>
    public async Task<bool> IsMp3DataAsync(Stream stream)
    {
        // Reset the stream to the start
        stream.Seek(0, SeekOrigin.Begin);

        // Declare variables for stream reading
        byte[] buffer;
        int bytesRead;

        // Skip null bytes
        while (true)
        {
            buffer = new byte[1];
            bytesRead = await stream.ReadAsync(buffer.AsMemory(0, 1));

            // End of stream reached without finding a non-null byte
            if (bytesRead == 0)
            {
                // Reset the stream to the start
                stream.Seek(0, SeekOrigin.Begin);
                return false;
            }

            // Found a non-null byte, go back 1 byte and break out of the loop
            if (buffer[0] != 0x0)
            {
                stream.Seek(-1, SeekOrigin.Current);
                break;
            }
        }

        // Read the first 3 non-null bytes of the stream
        buffer = new byte[3];
        bytesRead = await stream.ReadAsync(buffer.AsMemory(0, 3));

        // Reset the stream to the start
        stream.Seek(0, SeekOrigin.Begin);

        // If we read less than 3 bytes, this is not a valid MP3 file
        if (bytesRead < 3)
        {
            return false;
        }

        // Header is "ID3" - an MP3 file with IDv3 tags
        if (buffer[0] == 0x49 && buffer[1] == 0x44 && buffer[2] == 0x33)
        {
            return true;
        }

        // Return true if the header is 0xFFE or 0xFFF - an MP3 file without IDv3 tags
        return buffer[0] == 0xFF && (buffer[1] & 0xE0) == 0xE0;
    }

    private static Task WaitForExitAsync(Process process)
    {
        var tcs = new TaskCompletionSource<object>();
        process.EnableRaisingEvents = true;
        process.Exited += (sender, args) => tcs.TrySetResult(null);
        return tcs.Task;
    }
}
