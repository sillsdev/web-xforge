using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The SignalR notification hub for apply draft notifications.
/// </summary>
/// <param name="realtimeService">The realtime service.</param>
public class DraftNotificationHub(IRealtimeService realtimeService)
    : NotificationHubBase<IDraftNotifier>(realtimeService) { }
