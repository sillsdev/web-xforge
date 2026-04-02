using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The SignalR notification hub for sync and draft notifications.
/// </summary>
/// <param name="realtimeService">The realtime service.</param>
public class NotificationHub(IRealtimeService realtimeService) : NotificationHubBase<INotifier>(realtimeService) { }
