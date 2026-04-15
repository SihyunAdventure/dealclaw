import {
  SESClient,
  SendEmailCommand,
  type MessageTag,
  type SendEmailCommandInput,
} from "@aws-sdk/client-ses";

const DEFAULT_REGION = "ap-northeast-2";

export function resolveSesRegion(override?: string | null) {
  return (
    override ||
    process.env.HIB_AWS_SES_REGION ||
    process.env.AWS_SES_REGION ||
    process.env.AWS_REGION ||
    DEFAULT_REGION
  );
}

export function createSesClient(region?: string | null) {
  const resolvedRegion = resolveSesRegion(region);
  const accessKeyId =
    process.env.HIB_AWS_SES_ACCESS_KEY_ID ||
    process.env.AWS_SES_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.HIB_AWS_SES_SECRET_ACCESS_KEY ||
    process.env.AWS_SES_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY;

  return new SESClient({
    region: resolvedRegion,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

type SendEmailParams = {
  client?: SESClient;
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  configurationSetName?: string;
  tags?: MessageTag[];
};

function resolveFrom(from?: string) {
  const resolved = from || process.env.EMAIL_FROM;
  if (!resolved) {
    throw new Error(
      "EMAIL_FROM 환경변수가 설정되지 않았습니다 (예: 'hotinbeauty <noreply@hotinbeauty.com>')",
    );
  }
  return resolved;
}

function isDryRun() {
  return process.env.EMAIL_DRY_RUN === "1";
}

export async function sendEmail({
  client,
  from,
  to,
  subject,
  html,
  text,
  configurationSetName,
  tags,
}: SendEmailParams) {
  const toAddresses = Array.isArray(to) ? to : [to];
  const fromAddr = resolveFrom(from);

  if (isDryRun()) {
    console.log(
      `[email:dry-run] to=${toAddresses.join(",")} from=${fromAddr} subject="${subject}"`,
    );
    return { MessageId: `dry-run-${Date.now()}`, dryRun: true as const };
  }

  const resolvedClient = client ?? createSesClient();

  const input: SendEmailCommandInput = {
    Source: fromAddr,
    Destination: { ToAddresses: toAddresses },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: html, Charset: "UTF-8" },
        ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
      },
    },
    ConfigurationSetName: configurationSetName,
    Tags: tags,
  };

  const command = new SendEmailCommand(input);
  return resolvedClient.send(command);
}

type BatchParams = {
  client?: SESClient;
  from?: string;
  recipients: string[];
  subject: string;
  html: string;
  text?: string;
  rateLimit?: number;
  configurationSetName?: string;
  tags?: MessageTag[];
};

export async function sendBatchEmails({
  client,
  from,
  recipients,
  subject,
  html,
  text,
  rateLimit = 14,
  configurationSetName,
  tags,
}: BatchParams) {
  const resolvedClient = client ?? createSesClient();
  const results: { email: string; messageId?: string; error?: string }[] = [];

  for (let index = 0; index < recipients.length; index += rateLimit) {
    const batch = recipients.slice(index, index + rateLimit);

    const batchResults = await Promise.all(
      batch.map(async (email) => {
        try {
          const response = await sendEmail({
            client: resolvedClient,
            from,
            to: email,
            subject,
            html,
            text,
            configurationSetName,
            tags,
          });
          return { email, messageId: response.MessageId };
        } catch (error) {
          return {
            email,
            error: error instanceof Error ? error.message : "SES 발송 실패",
          };
        }
      }),
    );

    results.push(...batchResults);

    if (index + rateLimit < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}
