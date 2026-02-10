/**
 * 설정한 시간에 매일 로컬 알림 (Capacitor Local Notifications).
 * "알림 안 함"(off)이면 스케줄 취소.
 */

const REMINDER_NOTIFICATION_ID = 1;
const REMINDER_CHANNEL_ID = "arisum-reminder";

/** "22:00" → { hour: 22, minute: 0 } */
function parseTime(time: string): { hour: number; minute: number } | null {
  if (!time || time === "off") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function isReminderNotificationsAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  return platform === "android" || platform === "ios";
}

/** 권한 요청 후, 설정한 시간에 매일 알림 스케줄. time이 "off"거나 비어 있으면 기존 알림만 취소. */
export async function scheduleReminderAt(time: string): Promise<void> {
  if (!isReminderNotificationsAvailable()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");

  await LocalNotifications.requestPermissions();
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== "granted") return;

  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_NOTIFICATION_ID }] });

  const parsed = parseTime(time);
  if (!parsed) return;

  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: "일기 리마인더",
      importance: 4,
      visibility: 1,
    });
  } catch {
    // 채널 이미 있으면 무시
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_NOTIFICATION_ID,
        title: "별의 갈피",
        body: "오늘 하루를 별지기와 함께 기록해 보세요.",
        channelId: REMINDER_CHANNEL_ID,
        schedule: {
          on: { hour: parsed.hour, minute: parsed.minute },
          every: "day",
          allowWhileIdle: true,
        },
      },
    ],
  });
}
