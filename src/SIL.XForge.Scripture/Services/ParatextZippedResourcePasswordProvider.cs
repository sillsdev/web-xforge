using Paratext.Data.ProjectFileAccess;
using PtxUtils;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// An implementation of the Paratext zipped resource password provider.
/// </summary>
/// <seealso cref="IZippedResourcePasswordProvider" />
/// <param name="paratextOptions">The Paratext options.</param>
public class ParatextZippedResourcePasswordProvider(ParatextOptions? paratextOptions) : IZippedResourcePasswordProvider
{
    /// <summary>
    /// The cached password value.
    /// </summary>
    private string? _cachedValue;

    /// <inheritdoc />
    public string GetPassword()
    {
        // We can handle zip files with no password (for testing)
        if (
            string.IsNullOrWhiteSpace(paratextOptions?.ResourcePasswordBase64)
            || string.IsNullOrWhiteSpace(paratextOptions.ResourcePasswordHash)
        )
        {
            return string.Empty;
        }

        _cachedValue ??= StringUtils.DecryptStringFromBase64(
            paratextOptions.ResourcePasswordBase64,
            paratextOptions.ResourcePasswordHash
        );

        return _cachedValue!;
    }
}
