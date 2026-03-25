using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Services;

public class DraftNotificationHub(IRealtimeService realtimeService)
    : NotificationHubBase<IDraftNotifier>(realtimeService) { }
