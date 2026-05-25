import { NotificationEvent, NotificationEventType, NotificationSettings } from '@mc-host/shared-types';
import { SettingsStore } from './settings-store';

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  timestamp: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
}

interface DiscordPayload {
  username?: string;
  avatar_url?: string;
  allowed_mentions: { parse: never[] };
  embeds: DiscordEmbed[];
}

const COLORS: Record<NotificationEventType, number> = {
  'server.started': 0x57f287,
  'server.stopped': 0x99aab5,
  'server.crashed': 0xed4245,
  'player.joined': 0x5865f2,
  'player.left': 0xfee75c,
  'backup.completed': 0xeb459e,
};

export class NotificationService {
  constructor(private settingsStore: SettingsStore) {}

  getSettings(): NotificationSettings {
    return this.settingsStore.getNotificationSettings();
  }

  saveSettings(settings: NotificationSettings): void {
    this.settingsStore.saveNotificationSettings(settings);
  }

  async testWebhook(): Promise<boolean> {
    const settings = this.getSettings();
    if (!settings.webhook_url.trim()) {
      return false;
    }

    const payload: DiscordPayload = {
      username: settings.username || 'MC Hosting',
      avatar_url: settings.avatar_url || undefined,
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: 'MC Hosting notification test',
          description: 'Webhook configuration is working correctly.',
          color: 0x57f287,
          timestamp: new Date().toISOString(),
          footer: { text: 'Private Hosting App' },
        },
      ],
    };

    return this.postPayload(settings.webhook_url, payload);
  }

  async send(event: NotificationEvent): Promise<void> {
    const settings = this.getSettings();
    if (!this.canSend(settings) || !settings.enabled_events[event.type]) {
      return;
    }

    const payload: DiscordPayload = {
      username: settings.username || 'MC Hosting',
      avatar_url: settings.avatar_url || undefined,
      allowed_mentions: { parse: [] },
      embeds: [this.buildEmbed(event)],
    };

    await this.postPayload(settings.webhook_url, payload);
  }

  private canSend(settings: NotificationSettings): boolean {
    return settings.enabled && settings.webhook_url.trim().length > 0;
  }

  private buildEmbed(event: NotificationEvent): DiscordEmbed {
    switch (event.type) {
      case 'server.started':
        return {
          title: '🟢 Server started',
          description: `**${event.server_name}** is now online.`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [
            { name: 'Server ID', value: `\`${event.server_id}\``, inline: true },
            { name: 'Port', value: `\`${event.port}\``, inline: true },
          ],
          footer: { text: 'Private Hosting App' },
        };
      case 'server.stopped':
        return {
          title: '🟦 Server stopped',
          description: `**${event.server_name}** has been stopped.`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [
            { name: 'Exit code', value: `\`${event.exit_code ?? 'unknown'}\``, inline: true },
            { name: 'Signal', value: `\`${event.signal ?? 'none'}\``, inline: true },
          ],
          footer: { text: 'Private Hosting App' },
        };
      case 'server.crashed':
        return {
          title: '💥 Server crashed',
          description: `**${event.server_name}** crashed: ${event.reason}`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [
            { name: 'Exit code', value: `\`${event.exit_code ?? 'unknown'}\``, inline: true },
            { name: 'Signal', value: `\`${event.signal ?? 'none'}\``, inline: true },
          ],
          footer: { text: 'Private Hosting App' },
        };
      case 'player.joined':
        return {
          title: '👋 Player joined',
          description: `\`${event.player}\` joined **${event.server_name}**.`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [{ name: 'Server ID', value: `\`${event.server_id}\``, inline: true }],
          footer: { text: 'Private Hosting App' },
        };
      case 'player.left':
        return {
          title: '↩️ Player left',
          description: `\`${event.player}\` left **${event.server_name}**.`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [{ name: 'Server ID', value: `\`${event.server_id}\``, inline: true }],
          footer: { text: 'Private Hosting App' },
        };
      case 'backup.completed':
        return {
          title: '💾 Backup completed',
          description: `Scheduled backup finished for **${event.server_name}**.`,
          color: COLORS[event.type],
          timestamp: new Date().toISOString(),
          fields: [
            { name: 'Size', value: `${this.formatBytes(event.size_bytes)}`, inline: true },
            { name: 'Source', value: `\`${event.source}\``, inline: true },
            { name: 'Path', value: `\`${event.path}\``, inline: false },
          ],
          footer: { text: 'Private Hosting App' },
        };
      default: {
        const exhaustiveCheck: never = event;
        return {
          title: 'Notification',
          description: JSON.stringify(exhaustiveCheck),
          color: 0x99aab5,
          timestamp: new Date().toISOString(),
          footer: { text: 'Private Hosting App' },
        };
      }
    }
  }

  private async postPayload(webhookUrl: string, payload: DiscordPayload): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Discord webhook responded with ${response.status} ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.warn('[notifications] Failed to deliver webhook:', error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
