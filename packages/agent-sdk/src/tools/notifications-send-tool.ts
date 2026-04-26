import type { NotificationsSendInput, NotificationsSendOutput, RunContext, UnknownObject } from "../types.js";
import { BaseTool } from "./base-tool.js";

export class NotificationsSendTool extends BaseTool<"notifications.send", NotificationsSendInput, NotificationsSendOutput> {
  readonly name = "notifications.send";
  readonly description = "Sends a notification to a configured webhook.";

  protected async execute(input: NotificationsSendInput, context: RunContext): Promise<NotificationsSendOutput> {
    const destination = input.destination;
    const channel = input.channel;
    const message = input.message;
    const webhookUrl = process.env.NOTIFICATIONS_WEBHOOK_URL;

    if (!webhookUrl) {
      context.logger.info("Notifications webhook not configured, returning mock delivery", {
        destination,
        channel
      });
      return this.stub({
        delivered: true,
        destination,
        channel,
        provider: "mock"
      });
    }

    try {
      const response = await this.request<UnknownObject>(
        {
          method: "POST",
          url: webhookUrl,
          timeout: 5000,
          headers: {
            "Content-Type": "application/json"
          },
          data: {
            destination,
            channel,
            message
          }
        },
        { maxAttempts: 3 }
      );

      return {
        delivered: true,
        destination,
        channel,
        provider: "webhook",
        response
      };
    } catch (error) {
      throw this.formatAxiosError(`Notification send to "${destination}"`, error);
    }
  }
}
