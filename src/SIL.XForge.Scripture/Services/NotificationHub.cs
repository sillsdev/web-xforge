using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Services;

public class NotificationHub(IRealtimeService realtimeService) : NotificationHubBase<INotifier>(realtimeService) { }
