using System;
using System.Threading.Tasks;
using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Manages system-wide notifications that can be shown to users.
/// </summary>
public class NotificationService
{
    private readonly IRealtimeService _realtimeService;

    public NotificationService(IRealtimeService realtimeService) => _realtimeService = realtimeService;

    public async Task<string> CreateNotificationAsync(
        string title,
        string content,
        NotificationType type,
        NotificationScope scope,
        string[]? pageIds,
        DateTime expirationDate
    )
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Title = title,
            Content = content,
            Type = type,
            Scope = scope,
            PageIds = pageIds,
            ExpirationDate = expirationDate,
            CreationDate = DateTime.UtcNow
        };

        await using var connection = await _realtimeService.ConnectAsync();
        var doc = await connection.CreateAsync("notifications", notification);
        return doc.Id;
    }
}
