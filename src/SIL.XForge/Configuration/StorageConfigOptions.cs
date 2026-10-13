namespace SIL.XForge.Configuration;

/// <summary>
/// Storage provider configuration.
/// </summary>
public record StorageConfigOptions
{
    /// <summary>
    /// The S3 storage provider.
    /// </summary>
    public const string S3 = "S3";

    /// <summary>
    /// Gets or sets the storage provider.
    /// </summary>
    /// <value>This may be either <c>S3</c> or <c>FileSystem</c>.</value>
    /// <remarks>Defaults to <c>FileSystem</c>.</remarks>
    public string StorageProvider { get; set; } = "FileSystem";

    /// <summary>
    /// Gets of sets the Amazon region to use for S3.
    /// </summary>
    /// <remarks>
    /// Only use if <seealso cref="S3ServiceUrl" /> is not configured.
    /// </remarks>
    public string? S3Region { get; set; }

    /// <summary>
    /// Gets or sets the URL of the S3 Service.
    /// </summary>
    /// <remarks>
    /// Only use this if S3 not being hosted on AWS (i.e. locally or with another provider),
    /// and if <seealso cref="S3Region" /> is not configured.
    /// </remarks>
    public string? S3ServiceUrl { get; set; }
}
