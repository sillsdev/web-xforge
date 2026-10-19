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
    /// Gets or sets the bucket to use for S3.
    /// </summary>
    /// <remarks>
    /// This must be configured to use S3.
    /// </remarks>
    public string? S3Bucket { get; set; }

    /// <summary>
    /// Gets or sets the Amazon region to use for S3.
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

    /// <summary>
    /// Gets or sets a value indicating whether chunk encoding should be used.
    /// </summary>
    /// <value><c>true</c> if chunk encoding is to be used (default); otherwise, <c>false</c>.</value>
    /// <remarks>
    /// This should only be set to <c>false</c> if you are using a non-AWS S3 provider (such as Oracle),
    /// and you receive the error: <c>AWS chunked encoding not supported.</c>
    /// </remarks>
    public bool S3UseChunkEncoding { get; set; } = true;
}
